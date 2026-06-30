import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closeDatabase, ensureInitialized, query, withTransaction } from "../../src/shared/db/mysql.js";
import { bookClass, cancelMyBooking } from "../../src/features/studio/studio.service.js";
import { claimWebhookEvent } from "../../src/features/payments/payments.service.js";
import { saveStudioStaffProfile } from "../../src/features/admin/admin.service.js";
import { isRoleAllowed, resolveUserStudioRole } from "../../src/features/studio/studio.service.js";

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === "1";

function toSqlDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function timeToMinutes(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "").slice(0, 10) : toSqlDateTime(date).slice(0, 10);
}

function findFutureOpenSlot(hoursRows, holidayRows) {
  const hoursByWeekday = new Map(hoursRows.map((row) => [Number(row.weekday), row]));
  const holidays = new Set(holidayRows.map((row) => toDateKey(row.holidayDate)));

  for (let dayOffset = 7; dayOffset <= 60; dayOffset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setSeconds(0, 0);
    const dateKey = toSqlDateTime(date).slice(0, 10);
    if (holidays.has(dateKey)) continue;

    const hours = hoursByWeekday.get(date.getDay());
    if (hours && Number(hours.isClosed || 0) === 1) continue;
    const openMinutes = timeToMinutes(hours?.openTime, 9 * 60);
    const closeMinutes = timeToMinutes(hours?.closeTime, 22 * 60);
    if (closeMinutes - openMinutes < 60) continue;

    const startMinutes = Math.min(openMinutes + 60, closeMinutes - 60);
    const start = new Date(date);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { startAt: toSqlDateTime(start), endAt: toSqlDateTime(end) };
  }
  return null;
}

test("동시 예약은 정원을 넘지 않고 취소 시 첫 대기자를 승급한다", { skip: !shouldRun }, async (t) => {
  await ensureInitialized();
  const users = await query(
    `SELECT id FROM users WHERE account_status = 'active' ORDER BY created_at ASC LIMIT 2`,
  );
  if (users.length < 2) {
    t.skip("통합 테스트에 사용할 활성 회원이 2명 이상 필요합니다.");
    return;
  }

  const [hoursRows, holidayRows] = await Promise.all([
    query(`SELECT weekday, open_time AS openTime, close_time AS closeTime, is_closed AS isClosed FROM studio_business_hours`),
    query(`SELECT holiday_date AS holidayDate FROM studio_holidays`),
  ]);
  const slot = findFutureOpenSlot(hoursRows, holidayRows);
  if (!slot) {
    t.skip("향후 60일 안에 통합 테스트용 영업시간을 찾지 못했습니다.");
    return;
  }

  const classId = `test-class-${randomUUID()}`;
  const passIds = users.map(() => `test-pass-${randomUUID()}`);
  const title = `[통합테스트] ${randomUUID()}`;

  try {
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO studio_classes
          (id, class_type, title, instructor_name, room_name, start_at, end_at, capacity,
           min_capacity, waitlist_capacity, booking_deadline_at, cancellation_deadline_at,
           status, created_at, updated_at)
         VALUES (?, 'group', ?, '통합테스트', '테스트룸', ?, ?, 1, 0, 5,
                 DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY),
                 'active', NOW(), NOW())`,
        [classId, title, slot.startAt, slot.endAt],
      );

      for (let index = 0; index < users.length; index += 1) {
        await connection.execute(
          `INSERT INTO studio_passes
            (id, user_id, pass_name, pass_type, remaining_count, total_count, expires_at, status, created_at, updated_at)
           VALUES (?, ?, '통합테스트 수강권', 'group', 2, 2, DATE_ADD(NOW(), INTERVAL 90 DAY), 'active', NOW(), NOW())`,
          [passIds[index], users[index].id],
        );
      }
    });

    const results = await Promise.allSettled(
      users.map((user) => bookClass({ userId: user.id, classId })),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);

    const bookings = await query(
      `SELECT user_id AS userId, status FROM studio_bookings WHERE class_id = ? ORDER BY booked_at ASC`,
      [classId],
    );
    assert.equal(bookings.filter((row) => row.status === "reserved").length, 1);
    assert.equal(bookings.filter((row) => row.status === "waitlisted").length, 1);

    const reserved = bookings.find((row) => row.status === "reserved");
    const waitlisted = bookings.find((row) => row.status === "waitlisted");
    await cancelMyBooking({ userId: reserved.userId, classId });

    const afterCancel = await query(
      `SELECT user_id AS userId, status FROM studio_bookings WHERE class_id = ?`,
      [classId],
    );
    assert.equal(afterCancel.find((row) => row.userId === reserved.userId)?.status, "cancelled");
    assert.equal(afterCancel.find((row) => row.userId === waitlisted.userId)?.status, "reserved");

    const passRows = await query(
      `SELECT user_id AS userId, remaining_count AS remainingCount FROM studio_passes WHERE id IN (?, ?)`,
      passIds,
    );
    assert.equal(Number(passRows.find((row) => row.userId === reserved.userId)?.remainingCount), 2);
    assert.equal(Number(passRows.find((row) => row.userId === waitlisted.userId)?.remainingCount), 1);
  } finally {
    await withTransaction(async (connection) => {
      await connection.execute(`DELETE FROM studio_notifications WHERE user_id IN (?, ?) AND message LIKE ?`, [users[0].id, users[1].id, `${title}%`]);
      await connection.execute(`DELETE FROM studio_pass_transactions WHERE class_id = ?`, [classId]);
      await connection.execute(`DELETE FROM studio_bookings WHERE class_id = ?`, [classId]);
      await connection.execute(`DELETE FROM studio_classes WHERE id = ?`, [classId]);
      await connection.execute(`DELETE FROM studio_passes WHERE id IN (?, ?)`, passIds);
    });
  }
});

test("웹훅 이벤트는 한 번만 선점되고 실패한 이벤트만 재시도된다", { skip: !shouldRun }, async () => {
  await ensureInitialized();
  const webhookId = `test-webhook-${randomUUID()}`;
  const input = {
    webhookId,
    eventType: "Transaction.Paid",
    paymentId: `test-payment-${randomUUID()}`,
    rawBody: JSON.stringify({ test: true }),
  };

  try {
    const first = await claimWebhookEvent(input);
    const duplicate = await claimWebhookEvent(input);
    assert.deepEqual(first, { claimed: true, retry: false });
    assert.equal(duplicate.claimed, false);
    assert.equal(duplicate.status, "processing");
    assert.equal(duplicate.attempts, 2);

    await query(
      `UPDATE payment_webhook_events SET process_status = 'failed' WHERE webhook_id = ?`,
      [webhookId],
    );
    const retry = await claimWebhookEvent(input);
    assert.deepEqual(retry, { claimed: true, retry: true });

    const rows = await query(
      `SELECT process_status AS processStatus, attempts FROM payment_webhook_events WHERE webhook_id = ?`,
      [webhookId],
    );
    assert.equal(rows[0]?.processStatus, "processing");
    assert.equal(Number(rows[0]?.attempts), 3);
  } finally {
    await query(`DELETE FROM payment_webhook_events WHERE webhook_id = ?`, [webhookId]);
  }
});

test("직원 프로필에 연결된 로그인 계정에만 역할 권한이 적용된다", { skip: !shouldRun }, async (t) => {
  await ensureInitialized();
  const users = await query(
    `SELECT u.id
     FROM users u
     LEFT JOIN studio_staff_profiles staff ON staff.user_id = u.id
     WHERE u.account_status = 'active' AND staff.id IS NULL
     ORDER BY u.created_at ASC
     LIMIT 1`,
  );
  if (!users[0]?.id) {
    t.skip("직원 프로필에 연결되지 않은 활성 회원 계정이 필요합니다.");
    return;
  }

  const staffId = `test-staff-${randomUUID()}`;
  try {
    const staff = await saveStudioStaffProfile(staffId, {
      userId: users[0].id,
      name: `[통합테스트] 직원 ${randomUUID()}`,
      roleCode: "manager",
      employmentType: "full_time",
      status: "active",
    });
    assert.equal(staff.userId, users[0].id);
    assert.equal(staff.appConnectionStatus, "connected");
    assert.equal(await resolveUserStudioRole({ id: users[0].id, role: "user" }), "manager");
    assert.equal(await isRoleAllowed("manager", "class.write"), true);

    await query(`UPDATE studio_staff_profiles SET status = 'inactive' WHERE id = ?`, [staffId]);
    assert.equal(await resolveUserStudioRole({ id: users[0].id, role: "user" }), "");
  } finally {
    await query(`DELETE FROM studio_staff_profiles WHERE id = ?`, [staffId]);
  }
});

after(async () => {
  if (shouldRun) await closeDatabase();
});
