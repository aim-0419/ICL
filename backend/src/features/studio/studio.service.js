import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";
import { decryptPii, decryptUserRow, normalizeEmail } from "../../shared/security/pii.js";

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createHttpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnlyKey(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeValue(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

function isSameDate(left, right) {
  return toDateOnlyKey(left) === toDateOnlyKey(right);
}

function normalizeTimeText(value) {
  const text = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text;
  return "00:00:00";
}

async function getBookingPolicyWithConn(conn) {
  const rows = await conn.execute(
    `SELECT reserve_limit_hours AS reserveLimitHours,
            cancel_limit_hours AS cancelLimitHours,
            same_day_change_allowed AS sameDayChangeAllowed
     FROM studio_booking_policies
     LIMIT 1`
  );
  return rows?.[0]?.[0] || { reserveLimitHours: 24, cancelLimitHours: 6, sameDayChangeAllowed: 0 };
}

async function assertBookingPolicyAllows(conn, classStartAt, action) {
  const start = normalizeDate(classStartAt);
  if (!start) throw createHttpError("수업 시작 시간을 확인할 수 없습니다.", 400);
  const policy = await getBookingPolicyWithConn(conn);
  const limitHours = action === "cancel" ? Number(policy.cancelLimitHours || 0) : Number(policy.reserveLimitHours || 0);
  if (limitHours > 0 && start.getTime() - Date.now() < limitHours * 60 * 60 * 1000) {
    throw createHttpError(action === "cancel" ? "취소 가능 시간이 지났습니다." : "예약 가능 시간이 지났습니다.", 400);
  }
  if (!policy.sameDayChangeAllowed && isSameDate(start, new Date())) {
    throw createHttpError("당일 예약/변경이 제한되어 있습니다.", 400);
  }
}

async function assertStudioOpenForClass({ startAt, endAt, conn = null }) {
  const start = normalizeDate(startAt);
  const end = normalizeDate(endAt);
  if (!start || !end || end <= start) {
    throw createHttpError("수업 시간 정보가 올바르지 않습니다.", 400);
  }

  const holidayDate = toDateOnlyKey(start);
  const holidaySql = `SELECT id FROM studio_holidays WHERE holiday_date = ? LIMIT 1`;
  const holidayRows = conn ? await conn.execute(holidaySql, [holidayDate]) : [await query(holidaySql, [holidayDate])];
  if (holidayRows?.[0]?.length) {
    throw createHttpError("휴일에는 수업을 등록하거나 예약할 수 없습니다.", 400);
  }

  const weekday = start.getDay();
  const hoursSql = `SELECT open_time AS openTime, close_time AS closeTime, is_closed AS isClosed
                    FROM studio_business_hours
                    WHERE weekday = ?
                    LIMIT 1`;
  const hoursRows = conn ? await conn.execute(hoursSql, [weekday]) : [await query(hoursSql, [weekday])];
  const hours = hoursRows?.[0]?.[0] || null;
  if (!hours) return;
  if (Number(hours.isClosed || 0) === 1) {
    throw createHttpError("영업하지 않는 날입니다.", 400);
  }

  const startTime = toTimeValue(start);
  const endTime = toTimeValue(end);
  const openTime = normalizeTimeText(hours.openTime || "00:00:00");
  const closeTime = normalizeTimeText(hours.closeTime || "23:59:59");
  if (startTime < openTime || endTime > closeTime) {
    throw createHttpError("영업시간 외에는 수업을 등록하거나 예약할 수 없습니다.", 400);
  }
}

async function createNotificationWithConn(conn, payload) {
  const id = randomUUID();
  await conn.execute(
    `INSERT INTO studio_notifications
      (id, user_id, type, title, message, status, scheduled_at, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      String(payload?.userId || "").trim(),
      String(payload?.type || "system").trim(),
      String(payload?.title || "").trim(),
      String(payload?.message || "").trim(),
      String(payload?.status || "sent").trim(),
      payload?.scheduledAt || null,
    ]
  );
  return id;
}

function assertFutureClass(startAt) {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
    const err = new Error("과거 수업에는 예약할 수 없습니다.");
    err.status = 400;
    throw err;
  }
}

export async function listClasses({ from = "", to = "", userId = "" } = {}) {
  const params = [];
  let where = " WHERE 1=1 ";
  if (from) {
    where += " AND sc.start_at >= ? ";
    params.push(from);
  }
  if (to) {
    where += " AND sc.start_at <= ? ";
    params.push(to);
  }
  const rows = await query(
    `SELECT
      sc.id,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt,
      sc.end_at AS endAt,
      sc.capacity,
      sc.status,
      SUM(CASE WHEN sb.status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount,
      SUM(CASE WHEN sb.status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlistCount
    FROM studio_classes sc
    LEFT JOIN studio_bookings sb ON sb.class_id = sc.id
    ${where}
    GROUP BY sc.id
    ORDER BY sc.start_at ASC`,
    params
  );

  let myBookings = [];
  if (userId) {
    myBookings = await query(
      `SELECT class_id AS classId, status
       FROM studio_bookings
       WHERE user_id = ? AND status IN ('reserved','waitlisted')`,
      [userId]
    );
  }
  const myMap = new Map(myBookings.map((b) => [String(b.classId), String(b.status)]));
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    reservedCount: toCount(row.reservedCount),
    waitlistCount: toCount(row.waitlistCount),
    myStatus: myMap.get(String(row.id)) || "available",
  }));
}

export async function listClassesForAdmin({ from = "", to = "", status = "" } = {}) {
  const params = [];
  let where = " WHERE 1=1 ";
  if (from) {
    where += " AND sc.start_at >= ? ";
    params.push(from);
  }
  if (to) {
    where += " AND sc.start_at <= ? ";
    params.push(to);
  }
  if (status && ["active", "cancelled", "deleted"].includes(String(status))) {
    where += " AND sc.status = ? ";
    params.push(status);
  }
  const rows = await query(
    `SELECT
      sc.id,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt,
      sc.end_at AS endAt,
      sc.capacity,
      sc.status,
      SUM(CASE WHEN sb.status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount,
      SUM(CASE WHEN sb.status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlistCount
    FROM studio_classes sc
    LEFT JOIN studio_bookings sb ON sb.class_id = sc.id
    ${where}
    GROUP BY sc.id
    ORDER BY sc.start_at ASC`,
    params
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    reservedCount: toCount(row.reservedCount),
    waitlistCount: toCount(row.waitlistCount),
  }));
}

export async function listMyPasses(userId) {
  const rows = await query(
    `SELECT id, pass_name AS passName, pass_type AS passType, remaining_count AS remainingCount,
            total_count AS totalCount, expires_at AS expiresAt, status
     FROM studio_passes
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listMyPassTransactions(userId) {
  const rows = await query(
    `SELECT
       spt.id,
       spt.pass_id AS passId,
       sp.pass_name AS passName,
       spt.class_id AS classId,
       sc.title AS classTitle,
       spt.delta_count AS deltaCount,
       spt.reason,
       spt.created_at AS createdAt
     FROM studio_pass_transactions spt
     INNER JOIN studio_passes sp ON sp.id = spt.pass_id
     LEFT JOIN studio_classes sc ON sc.id = spt.class_id
     WHERE spt.user_id = ?
     ORDER BY spt.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listPassTransactionsForAdmin({ limit = 200 } = {}) {
  const rows = await query(
    `SELECT
       spt.id,
       spt.user_id AS userId,
       u.name,
       u.login_id AS loginId,
       u.phone,
       spt.pass_id AS passId,
       sp.pass_name AS passName,
       sp.pass_type AS passType,
       spt.class_id AS classId,
       sc.title AS classTitle,
       spt.delta_count AS deltaCount,
       spt.reason,
       spt.created_at AS createdAt
     FROM studio_pass_transactions spt
     INNER JOIN studio_passes sp ON sp.id = spt.pass_id
     LEFT JOIN users u ON u.id = spt.user_id
     LEFT JOIN studio_classes sc ON sc.id = spt.class_id
     ORDER BY spt.created_at DESC
     LIMIT ?`,
    [Math.min(500, Math.max(1, Number(limit || 200)))]
  );
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const user = decryptUserRow({
      id: row.userId,
      name: row.name,
      loginId: row.loginId,
      phone: row.phone,
    });
    return {
      id: row.id,
      userId: row.userId,
      userName: user?.name || row.loginId || row.userId,
      loginId: user?.loginId || row.loginId || "",
      phone: user?.phone || "",
      passId: row.passId,
      passName: row.passName,
      passType: row.passType,
      classId: row.classId,
      classTitle: row.classTitle,
      deltaCount: Number(row.deltaCount || 0),
      reason: row.reason,
      createdAt: row.createdAt,
    };
  });
}

export async function listMyBookings(userId) {
  const rows = await query(
    `SELECT
      sb.id,
      sb.class_id AS classId,
      sb.status,
      sb.booked_at AS bookedAt,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt
     FROM studio_bookings sb
     INNER JOIN studio_classes sc ON sc.id = sb.class_id
     WHERE sb.user_id = ? AND sb.status IN ('reserved','waitlisted')
     ORDER BY sc.start_at ASC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function bookClass({ userId, classId }) {
  return withTransaction(async (conn) => {
    const classRows = await conn.execute(
      `SELECT id, title, start_at, end_at, capacity, status
       FROM studio_classes
       WHERE id = ?
       LIMIT 1`,
      [classId]
    );
    const classInfo = classRows?.[0]?.[0] || null;
    if (!classInfo) throw createHttpError("Class not found.", 404);
    if (String(classInfo.status) !== "active") throw createHttpError("This class cannot be booked.", 400);

    assertFutureClass(classInfo.start_at);
    await assertStudioOpenForClass({ startAt: classInfo.start_at, endAt: classInfo.end_at, conn });
    await assertBookingPolicyAllows(conn, classInfo.start_at, "book");

    const existRows = await conn.execute(
      `SELECT id, status FROM studio_bookings WHERE class_id = ? AND user_id = ? LIMIT 1`,
      [classId, userId]
    );
    const exist = existRows?.[0]?.[0] || null;
    if (exist && (exist.status === "reserved" || exist.status === "waitlisted")) {
      throw createHttpError("Class is already booked or waitlisted.", 409);
    }

    const passRows = await conn.execute(
      `SELECT id, remaining_count AS remainingCount
       FROM studio_passes
       WHERE user_id = ?
         AND status = 'active'
         AND remaining_count > 0
         AND (expires_at IS NULL OR expires_at >= NOW())
       ORDER BY expires_at IS NULL DESC, expires_at ASC, created_at ASC
       LIMIT 1`,
      [userId]
    );
    const pass = passRows?.[0]?.[0] || null;
    if (!pass) throw createHttpError("No usable pass is available.", 400);

    const cntRows = await conn.execute(
      `SELECT SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount
       FROM studio_bookings
       WHERE class_id = ?`,
      [classId]
    );
    const reservedCount = toCount(cntRows?.[0]?.[0]?.reservedCount);
    const isReserved = reservedCount < toCount(classInfo.capacity);
    const bookingStatus = isReserved ? "reserved" : "waitlisted";
    const bookingId = exist?.id || randomUUID();
    if (exist) {
      await conn.execute(
        `UPDATE studio_bookings
         SET pass_id = ?, status = ?, booked_at = NOW(), cancelled_at = NULL
         WHERE id = ?`,
        [isReserved ? pass.id : null, bookingStatus, bookingId]
      );
    } else {
      await conn.execute(
        `INSERT INTO studio_bookings (id, class_id, user_id, pass_id, status, booked_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [bookingId, classId, userId, isReserved ? pass.id : null, bookingStatus]
      );
    }

    if (isReserved) {
      await conn.execute(
        `UPDATE studio_passes
         SET remaining_count = GREATEST(remaining_count - 1, 0), updated_at = NOW()
         WHERE id = ?`,
        [pass.id]
      );
      await conn.execute(
        `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
         VALUES (?, ?, ?, ?, -1, 'booking_confirmed', NOW())`,
        [randomUUID(), pass.id, userId, classId]
      );
    }

    await createNotificationWithConn(conn, {
      userId,
      type: bookingStatus === "reserved" ? "booking_confirmed" : "booking_waitlisted",
      title: bookingStatus === "reserved" ? "Booking confirmed" : "Waitlist registered",
      message: `${classInfo.title || "Class"} ${bookingStatus === "reserved" ? "booking has been confirmed." : "has been added to the waitlist."}`,
    });

    return { bookingStatus };
  });
}

export async function cancelMyBooking({ userId, classId }) {
  return withTransaction(async (conn) => {
    const rows = await conn.execute(
      `SELECT sb.id, sb.status, sb.pass_id AS passId, sc.title, sc.start_at AS startAt
       FROM studio_bookings sb
       INNER JOIN studio_classes sc ON sc.id = sb.class_id
       WHERE sb.class_id = ? AND sb.user_id = ?
       LIMIT 1`,
      [classId, userId]
    );
    const booking = rows?.[0]?.[0] || null;
    if (!booking || !["reserved", "waitlisted"].includes(String(booking.status))) {
      throw createHttpError("No cancellable booking exists.", 404);
    }

    await assertBookingPolicyAllows(conn, booking.startAt, "cancel");
    await conn.execute(
      `UPDATE studio_bookings
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = ?`,
      [booking.id]
    );

    if (booking.status === "reserved" && booking.passId) {
      await conn.execute(
        `UPDATE studio_passes
         SET remaining_count = remaining_count + 1, updated_at = NOW()
         WHERE id = ?`,
        [booking.passId]
      );
      await conn.execute(
        `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
         VALUES (?, ?, ?, ?, 1, 'booking_cancelled', NOW())`,
        [randomUUID(), booking.passId, userId, classId]
      );
      await createNotificationWithConn(conn, {
        userId,
        type: "booking_cancelled",
        title: "Booking cancelled",
        message: `${booking.title || "Class"} booking has been cancelled.`,
      });

      const waitRows = await conn.execute(
        `SELECT id, user_id AS userId
         FROM studio_bookings
         WHERE class_id = ? AND status = 'waitlisted'
         ORDER BY booked_at ASC
         LIMIT 1`,
        [classId]
      );
      const waiter = waitRows?.[0]?.[0] || null;
      if (waiter) {
        const passRows = await conn.execute(
          `SELECT id
           FROM studio_passes
           WHERE user_id = ?
             AND status = 'active'
             AND remaining_count > 0
             AND (expires_at IS NULL OR expires_at >= NOW())
           ORDER BY expires_at IS NULL DESC, expires_at ASC, created_at ASC
           LIMIT 1`,
          [waiter.userId]
        );
        const waiterPass = passRows?.[0]?.[0] || null;
        if (waiterPass) {
          await conn.execute(
            `UPDATE studio_bookings SET status = 'reserved', pass_id = ? WHERE id = ?`,
            [waiterPass.id, waiter.id]
          );
          await conn.execute(
            `UPDATE studio_passes
             SET remaining_count = GREATEST(remaining_count - 1, 0), updated_at = NOW()
             WHERE id = ?`,
            [waiterPass.id]
          );
          await conn.execute(
            `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
             VALUES (?, ?, ?, ?, -1, 'waitlist_promoted', NOW())`,
            [randomUUID(), waiterPass.id, waiter.userId, classId]
          );
          await createNotificationWithConn(conn, {
            userId: waiter.userId,
            type: "waitlist_promoted",
            title: "Booking confirmed",
            message: `${booking.title || "Class"} waitlist booking has been confirmed.`,
          });
        }
      }
    } else {
      await createNotificationWithConn(conn, {
        userId,
        type: "booking_cancelled",
        title: "Waitlist cancelled",
        message: `${booking.title || "Class"} waitlist has been cancelled.`,
      });
    }
    return { ok: true };
  });
}

const VALID_CLASS_TYPES = ["private", "group", "consulting", "etc"];

export async function createClass(payload, userId) {
  await assertStudioOpenForClass({ startAt: payload?.startAt, endAt: payload?.endAt });
  const id = randomUUID();
  const classType = VALID_CLASS_TYPES.includes(payload?.classType) ? payload.classType : "group";
  await query(
    `INSERT INTO studio_classes
      (id, class_type, title, instructor_name, room_name, start_at, end_at, capacity, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
    [
      id,
      classType,
      String(payload?.title || "").trim(),
      String(payload?.instructorName || "").trim(),
      String(payload?.roomName || "").trim(),
      payload?.startAt,
      payload?.endAt,
      Math.max(1, Number(payload?.capacity || 1)),
      userId,
    ]
  );
  return queryOne(`SELECT * FROM studio_classes WHERE id = ?`, [id]);
}

export async function createClassesWithRepeat(payload, userId) {
  const repeatWeeks = Math.max(1, Math.min(24, Number(payload?.repeatWeeks || 1)));
  const startBase = new Date(payload?.startAt);
  const endBase = new Date(payload?.endAt);
  if (Number.isNaN(startBase.getTime()) || Number.isNaN(endBase.getTime()) || endBase <= startBase) {
    const err = new Error("수업 시간 정보가 올바르지 않습니다.");
    err.status = 400;
    throw err;
  }

  const recurrenceId = repeatWeeks > 1 ? randomUUID() : null;
  const rows = [];
  for (let i = 0; i < repeatWeeks; i += 1) {
    const start = new Date(startBase.getTime() + i * 7 * 86400000);
    const end = new Date(endBase.getTime() + i * 7 * 86400000);
    await assertStudioOpenForClass({ startAt: start, endAt: end });
    const id = randomUUID();
    const classType = VALID_CLASS_TYPES.includes(payload?.classType) ? payload.classType : "group";
    await query(
      `INSERT INTO studio_classes
        (id, class_type, title, instructor_name, room_name, start_at, end_at, capacity, status, repeat_group_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(), NOW())`,
      [
        id,
        classType,
        String(payload?.title || "").trim(),
        String(payload?.instructorName || "").trim(),
        String(payload?.roomName || "").trim(),
        start,
        end,
        Math.max(1, Number(payload?.capacity || 1)),
        recurrenceId,
        userId,
      ]
    );
    rows.push(await queryOne(`SELECT * FROM studio_classes WHERE id = ?`, [id]));
  }

  if (recurrenceId) {
    const weekday = startBase.getDay();
    await query(
      `INSERT INTO studio_class_recurrences
        (id, repeat_group_id, weekday, start_time, end_time, weeks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        randomUUID(),
        recurrenceId,
        weekday,
        `${String(startBase.getHours()).padStart(2, "0")}:${String(startBase.getMinutes()).padStart(2, "0")}:00`,
        `${String(endBase.getHours()).padStart(2, "0")}:${String(endBase.getMinutes()).padStart(2, "0")}:00`,
        repeatWeeks,
      ]
    );
  }

  return rows;
}

export async function updateClass(classId, payload) {
  await assertStudioOpenForClass({ startAt: payload?.startAt, endAt: payload?.endAt });
  const classType = VALID_CLASS_TYPES.includes(payload?.classType) ? payload.classType : "group";
  await query(
    `UPDATE studio_classes
     SET class_type = ?, title = ?, instructor_name = ?, room_name = ?, start_at = ?, end_at = ?, capacity = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      classType,
      String(payload?.title || "").trim(),
      String(payload?.instructorName || "").trim(),
      String(payload?.roomName || "").trim(),
      payload?.startAt,
      payload?.endAt,
      Math.max(1, Number(payload?.capacity || 1)),
      classId,
    ]
  );
  return queryOne(`SELECT * FROM studio_classes WHERE id = ?`, [classId]);
}

export async function cancelClassByAdmin(classId) {
  await withTransaction(async (conn) => {
    const classRows = await conn.execute(`SELECT title FROM studio_classes WHERE id = ? LIMIT 1`, [classId]);
    const classInfo = classRows?.[0]?.[0] || {};
    const bookingRows = await conn.execute(
      `SELECT id, user_id AS userId, pass_id AS passId, status
       FROM studio_bookings
       WHERE class_id = ? AND status IN ('reserved','waitlisted')`,
      [classId]
    );
    const bookings = Array.isArray(bookingRows?.[0]) ? bookingRows[0] : [];

    await conn.execute(`UPDATE studio_classes SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [classId]);
    await conn.execute(
      `UPDATE studio_bookings
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE class_id = ? AND status IN ('reserved','waitlisted')`,
      [classId]
    );

    for (const booking of bookings) {
      if (booking.status === "reserved" && booking.passId) {
        await conn.execute(
          `UPDATE studio_passes
           SET remaining_count = remaining_count + 1, updated_at = NOW()
           WHERE id = ?`,
          [booking.passId]
        );
        await conn.execute(
          `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
           VALUES (?, ?, ?, ?, 1, 'class_cancelled', NOW())`,
          [randomUUID(), booking.passId, booking.userId, classId]
        );
      }
      await createNotificationWithConn(conn, {
        userId: booking.userId,
        type: "class_cancelled",
        title: "Class cancelled",
        message: `${classInfo.title || "Class"} has been cancelled.`,
      });
    }
  });
}

export async function deleteClassByAdmin(classId) {
  await withTransaction(async (conn) => {
    const [bookingRows] = await conn.execute(
      `SELECT id, user_id AS userId, pass_id AS passId, status
       FROM studio_bookings
       WHERE class_id = ? AND status IN ('reserved','waitlisted')`,
      [classId]
    );
    const bookings = Array.isArray(bookingRows) ? bookingRows : [];

    for (const booking of bookings) {
      if (booking.status === "reserved" && booking.passId) {
        await conn.execute(
          `UPDATE studio_passes
           SET remaining_count = remaining_count + 1, updated_at = NOW()
           WHERE id = ?`,
          [booking.passId]
        );
        await conn.execute(
          `INSERT INTO studio_pass_transactions (id, pass_id, user_id, class_id, delta_count, reason, created_at)
           VALUES (?, ?, ?, ?, 1, 'class_deleted', NOW())`,
          [randomUUID(), booking.passId, booking.userId, classId]
        );
      }
    }

    await conn.execute(
      `UPDATE studio_bookings
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE class_id = ? AND status IN ('reserved','waitlisted')`,
      [classId]
    );
    await conn.execute(`UPDATE studio_classes SET status = 'deleted', updated_at = NOW() WHERE id = ?`, [classId]);
  });
}

export async function listClassBookings(classId) {
  const rows = await query(
    `SELECT
       sb.id,
       sb.user_id AS userId,
       sb.status,
       sb.booked_at AS bookedAt,
       u.login_id AS loginId,
       u.name,
       u.email,
       u.phone,
       sp.pass_name AS passName,
       sp.remaining_count AS remainingCount,
       sp.total_count AS totalCount,
       COALESCE(sa.openAmount, 0) AS openArrearsAmount
     FROM studio_bookings sb
     LEFT JOIN users u ON u.id = sb.user_id
     LEFT JOIN studio_passes sp ON sp.id = sb.pass_id
     LEFT JOIN (
       SELECT user_id, SUM(amount) AS openAmount
       FROM studio_arrears
       WHERE status = 'open'
       GROUP BY user_id
     ) sa ON sa.user_id = sb.user_id
     WHERE sb.class_id = ?
     ORDER BY FIELD(sb.status,'reserved','waitlisted','cancelled'), sb.booked_at ASC`,
    [classId]
  );
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const user = decryptUserRow({
      id: row.userId,
      loginId: row.loginId,
      name: row.name,
      email: row.email,
      phone: row.phone,
    });
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      bookedAt: row.bookedAt,
      userName: user?.name || row.loginId || row.userId,
      userEmail: user?.email || "",
      userPhone: user?.phone || "",
      passName: row.passName || "",
      remainingCount: toCount(row.remainingCount),
      totalCount: toCount(row.totalCount),
      openArrearsAmount: Number(row.openArrearsAmount || 0),
    };
  });
}

/**
 * 관리자용 전체 예약 내역 조회입니다.
 * 날짜 범위·예약 상태로 필터링할 수 있으며, 수업 정보·회원 정보·수강권 정보를 함께 반환합니다.
 */
export async function listAllBookingsForAdmin({ from = "", to = "", status = "" } = {}) {
  const params = [];
  let where = " WHERE 1=1 ";
  if (from) { where += " AND sc.start_at >= ? "; params.push(from); }
  if (to)   { where += " AND sc.start_at <= ? "; params.push(to); }
  if (status && ["reserved", "waitlisted", "cancelled"].includes(status)) {
    where += " AND sb.status = ? ";
    params.push(status);
  }

  const rows = await query(
    `SELECT
       sb.id,
       sb.class_id AS classId,
       sb.user_id AS userId,
       sb.status,
       sb.booked_at AS bookedAt,
       sc.title AS classTitle,
       sc.instructor_name AS instructorName,
       sc.room_name AS roomName,
       sc.start_at AS startAt,
       sc.end_at AS endAt,
       sc.capacity,
       u.login_id AS loginId,
       u.name,
       u.email,
       u.phone,
       sp.pass_name AS passName,
       sp.remaining_count AS remainingCount,
       COALESCE(sa.openAmount, 0) AS openArrearsAmount
     FROM studio_bookings sb
     JOIN studio_classes sc ON sc.id = sb.class_id
     LEFT JOIN users u ON u.id = sb.user_id
     LEFT JOIN studio_passes sp ON sp.id = sb.pass_id
     LEFT JOIN (
       SELECT user_id, SUM(amount) AS openAmount
       FROM studio_arrears WHERE status = 'open'
       GROUP BY user_id
     ) sa ON sa.user_id = sb.user_id
     ${where}
     ORDER BY sc.start_at DESC, sb.booked_at ASC`,
    params
  );

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const user = decryptUserRow({
      id: row.userId, loginId: row.loginId,
      name: row.name, email: row.email, phone: row.phone,
    });
    return {
      id: row.id,
      classId: row.classId,
      classTitle: row.classTitle,
      instructorName: row.instructorName,
      roomName: row.roomName,
      startAt: row.startAt,
      endAt: row.endAt,
      capacity: toCount(row.capacity),
      userId: row.userId,
      status: row.status,
      bookedAt: row.bookedAt,
      userName: user?.name || row.loginId || row.userId,
      userPhone: user?.phone || "",
      passName: row.passName || "",
      remainingCount: toCount(row.remainingCount),
      openArrearsAmount: Number(row.openArrearsAmount || 0),
    };
  });
}

export async function createPassByAdmin(payload) {
  const id = randomUUID();
  const userId = String(payload?.userId || "").trim();
  const passName = String(payload?.passName || "").trim();
  const totalCount = Math.max(0, Number(payload?.totalCount || 0));
  const remainingCount = Math.max(0, Number(payload?.remainingCount || payload?.totalCount || 0));
  const amount = Math.max(0, Number(payload?.amount || 0));
  if (!userId || !passName || totalCount <= 0) {
    throw createHttpError("수강권 생성 정보가 올바르지 않습니다.", 400);
  }
  await withTransaction(async (conn) => {
    const userRows = await conn.execute(
      `SELECT id FROM users WHERE id = ? AND account_status = 'active' LIMIT 1`,
      [userId]
    );
    if (!userRows?.[0]?.[0]?.id) {
      throw createHttpError("수강권을 부여할 회원을 찾을 수 없습니다.", 404);
    }

    await conn.execute(
      `INSERT INTO studio_passes
        (id, user_id, pass_name, pass_type, remaining_count, total_count, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        id,
        userId,
        passName,
        String(payload?.passType || "group").trim(),
        remainingCount,
        totalCount,
        payload?.expiresAt || null,
      ]
    );

    if (amount > 0) {
      await conn.execute(
        `INSERT INTO studio_pass_payments
          (id, pass_id, user_id, payment_type, amount, paid_at, payment_method, installment_months, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          randomUUID(),
          id,
          userId,
          String(payload?.paymentType || "신규결제").trim(),
          amount,
          payload?.paidAt || new Date(),
          String(payload?.paymentMethod || "").trim() || null,
          String(payload?.installmentMonths || "").trim() || null,
          String(payload?.paymentNote || "").trim() || null,
        ]
      );
    }
  });
  const row = await queryOne(
    `SELECT id,
            pass_name AS passName,
            pass_type AS passType,
            remaining_count AS remainingCount,
            total_count AS totalCount,
            expires_at AS expiresAt,
            status,
            created_at AS createdAt,
            (
              SELECT JSON_OBJECT(
                'paymentType', spp.payment_type,
                'amount', spp.amount,
                'paidAt', DATE_FORMAT(spp.paid_at, '%Y-%m-%d'),
                'paymentMethod', spp.payment_method,
                'installmentMonths', spp.installment_months,
                'note', spp.note
              )
              FROM studio_pass_payments spp
              WHERE spp.pass_id = studio_passes.id
              ORDER BY COALESCE(spp.paid_at, spp.created_at) DESC
              LIMIT 1
            ) AS payment
     FROM studio_passes
     WHERE id = ?`,
    [id]
  );
  return {
    ...row,
    payment: typeof row?.payment === "string" ? parseJson(row.payment, null) : row?.payment || null,
  };
}

export async function updatePassStatus(passId, status) {
  const normalizedStatus = String(status || "").trim();
  if (!["active", "paused", "transferred", "refunded"].includes(normalizedStatus)) {
    throw createHttpError("수강권 상태 값이 올바르지 않습니다.", 400);
  }
  await query(
    `UPDATE studio_passes
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [normalizedStatus, passId]
  );
}

export async function listPassesByUser(userId) {
  const rows = await query(
    `SELECT id, pass_name AS passName, pass_type AS passType, remaining_count AS remainingCount,
            total_count AS totalCount, expires_at AS expiresAt, status, created_at AS createdAt,
            (
              SELECT JSON_OBJECT(
                'paymentType', spp.payment_type,
                'amount', spp.amount,
                'paidAt', DATE_FORMAT(spp.paid_at, '%Y-%m-%d'),
                'paymentMethod', spp.payment_method,
                'installmentMonths', spp.installment_months,
                'note', spp.note
              )
              FROM studio_pass_payments spp
              WHERE spp.pass_id = studio_passes.id
              ORDER BY COALESCE(spp.paid_at, spp.created_at) DESC
              LIMIT 1
            ) AS payment
     FROM studio_passes
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    payment: typeof row.payment === "string" ? parseJson(row.payment, null) : row.payment,
  }));
}

export async function listStudioMemberSummaries() {
  const rows = await query(
    `SELECT
        sp.user_id AS userId,
        COUNT(*) AS passCount,
        SUM(CASE
          WHEN sp.status = 'active'
            AND (sp.expires_at IS NULL OR sp.expires_at >= NOW())
          THEN 1 ELSE 0 END) AS activePassCount,
        SUM(CASE
          WHEN sp.expires_at IS NOT NULL AND sp.expires_at < NOW()
          THEN 1 ELSE 0 END) AS expiredPassCount,
        SUM(CASE
          WHEN sp.status = 'active'
            AND (sp.expires_at IS NULL OR sp.expires_at >= NOW())
          THEN sp.remaining_count ELSE 0 END) AS remainingCount,
        MIN(CASE
          WHEN sp.status = 'active'
            AND sp.expires_at IS NOT NULL
            AND sp.expires_at >= NOW()
          THEN sp.expires_at ELSE NULL END) AS nearestExpiresAt,
        (
          SELECT latest.pass_name
          FROM studio_passes latest
          WHERE latest.user_id = sp.user_id
          ORDER BY latest.created_at DESC
          LIMIT 1
        ) AS latestPassName,
        MAX(sp.created_at) AS latestPassCreatedAt
     FROM studio_passes sp
     GROUP BY sp.user_id
     ORDER BY latestPassCreatedAt DESC`
  );

  const now = Date.now();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const passCount = Math.max(0, Number(row.passCount || 0));
    const activePassCount = Math.max(0, Number(row.activePassCount || 0));
    const remainingCount = Math.max(0, Number(row.remainingCount || 0));
    const nearestExpiresAt = row.nearestExpiresAt || null;
    const daysUntilExpiry = nearestExpiresAt
      ? Math.ceil((new Date(nearestExpiresAt).getTime() - now) / 86400000)
      : null;
    const passStatus =
      passCount <= 0
        ? "none"
        : activePassCount <= 0
          ? "expired"
          : daysUntilExpiry !== null && daysUntilExpiry <= 14
            ? "expiring"
            : "active";

    return {
      userId: row.userId,
      passCount,
      activePassCount,
      expiredPassCount: Math.max(0, Number(row.expiredPassCount || 0)),
      remainingCount,
      nearestExpiresAt,
      daysUntilExpiry,
      latestPassName: row.latestPassName || "",
      passStatus,
      hasStudioPass: passCount > 0,
      isStudioMember: passStatus === "active" || passStatus === "expiring",
      isExpiredStudioMember: passStatus === "expired",
    };
  });
}

export async function getStudioSettings() {
  const [businessHours, holidays, policy] = await Promise.all([
    query(
      `SELECT weekday, open_time AS openTime, close_time AS closeTime, is_closed AS isClosed
       FROM studio_business_hours
       ORDER BY weekday ASC`
    ),
    query(
      `SELECT id, holiday_date AS holidayDate, title, note
       FROM studio_holidays
       ORDER BY holiday_date ASC`
    ),
    queryOne(
      `SELECT reserve_limit_hours AS reserveLimitHours,
              cancel_limit_hours AS cancelLimitHours,
              same_day_change_allowed AS sameDayChangeAllowed,
              operation_json AS operationJson
       FROM studio_booking_policies
       LIMIT 1`
    ),
  ]);
  let operationSettings = {};
  if (policy?.operationJson) {
    try {
      operationSettings = typeof policy.operationJson === "string" ? JSON.parse(policy.operationJson) : policy.operationJson;
    } catch (_) {}
  }
  return {
    businessHours: Array.isArray(businessHours) ? businessHours : [],
    holidays: Array.isArray(holidays) ? holidays : [],
    policy: policy ? { reserveLimitHours: policy.reserveLimitHours, cancelLimitHours: policy.cancelLimitHours, sameDayChangeAllowed: policy.sameDayChangeAllowed } : { reserveLimitHours: 24, cancelLimitHours: 6, sameDayChangeAllowed: 0 },
    operationSettings,
  };
}

export async function saveBusinessHours(rows) {
  await withTransaction(async (conn) => {
    await conn.execute(`DELETE FROM studio_business_hours`);
    for (const row of Array.isArray(rows) ? rows : []) {
      await conn.execute(
        `INSERT INTO studio_business_hours (id, weekday, open_time, close_time, is_closed, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [randomUUID(), Number(row.weekday), row.openTime || "09:00:00", row.closeTime || "22:00:00", row.isClosed ? 1 : 0]
      );
    }
  });
}

export async function saveBookingPolicy(policy) {
  const { operationSettings, ...basicPolicy } = policy || {};
  await query(`DELETE FROM studio_booking_policies`);
  await query(
    `INSERT INTO studio_booking_policies
      (id, reserve_limit_hours, cancel_limit_hours, same_day_change_allowed, operation_json, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      randomUUID(),
      Math.max(0, Number(basicPolicy?.reserveLimitHours || 24)),
      Math.max(0, Number(basicPolicy?.cancelLimitHours || 6)),
      basicPolicy?.sameDayChangeAllowed ? 1 : 0,
      operationSettings ? JSON.stringify(operationSettings) : null,
    ]
  );
}

export async function getStudioInfo() {
  const row = await queryOne(`SELECT studio_name AS studioName, address, address_detail AS addressDetail, phones, sms_sender AS smsSender, updated_at AS updatedAt FROM studio_info WHERE id = 'main' LIMIT 1`);
  if (!row) return { studioName: "", address: "", addressDetail: "", phones: [], smsSender: "", updatedAt: null };
  return { ...row, phones: Array.isArray(row.phones) ? row.phones : (typeof row.phones === "string" ? JSON.parse(row.phones) : []) };
}

export async function saveStudioInfo(payload) {
  const studioName = String(payload?.studioName || "").trim();
  const address = String(payload?.address || "").trim();
  const addressDetail = String(payload?.addressDetail || "").trim();
  const phones = JSON.stringify(Array.isArray(payload?.phones) ? payload.phones : []);
  const smsSender = String(payload?.smsSender || "").trim();
  await query(
    `INSERT INTO studio_info (id, studio_name, address, address_detail, phones, sms_sender, updated_at)
     VALUES ('main', ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       studio_name = VALUES(studio_name),
       address = VALUES(address),
       address_detail = VALUES(address_detail),
       phones = VALUES(phones),
       sms_sender = VALUES(sms_sender),
       updated_at = NOW()`,
    [studioName, address, addressDetail, phones, smsSender]
  );
  return getStudioInfo();
}

export async function getSalesPin() {
  const row = await queryOne(`SELECT sales_pin AS salesPin FROM studio_info WHERE id = 'main' LIMIT 1`);
  const pin = row?.salesPin || "";
  return { hasPin: Boolean(pin), masked: pin ? "****" : "" };
}

export async function saveSalesPin(pin) {
  const pinValue = pin ? String(pin).trim().slice(0, 20) : "";
  await query(
    `INSERT INTO studio_info (id, sales_pin) VALUES ('main', ?)
     ON DUPLICATE KEY UPDATE sales_pin = VALUES(sales_pin)`,
    [pinValue]
  );
  return { ok: true };
}

export async function getRoomSettings() {
  const [row, rooms] = await Promise.all([
    queryOne(`SELECT rooms_enabled AS roomsEnabled FROM studio_info WHERE id = 'main' LIMIT 1`),
    query(`SELECT id, name, is_active AS isActive, sort_order AS sortOrder FROM studio_rooms ORDER BY sort_order ASC, created_at ASC`),
  ]);
  return {
    roomsEnabled: row?.roomsEnabled ? true : false,
    rooms: Array.isArray(rooms) ? rooms : [],
  };
}

export async function saveRoomEnabled(enabled) {
  await query(
    `INSERT INTO studio_info (id, rooms_enabled, updated_at)
     VALUES ('main', ?, NOW())
     ON DUPLICATE KEY UPDATE rooms_enabled = VALUES(rooms_enabled), updated_at = NOW()`,
    [enabled ? 1 : 0]
  );
}

export async function createRoom(name) {
  const id = randomUUID();
  const [countRow] = await query(`SELECT COUNT(*) AS cnt FROM studio_rooms`);
  const sortOrder = (countRow?.cnt || 0);
  await query(
    `INSERT INTO studio_rooms (id, name, is_active, sort_order, created_at) VALUES (?, ?, 1, ?, NOW())`,
    [id, String(name || "").trim(), sortOrder]
  );
  return { id, name: String(name || "").trim(), isActive: true, sortOrder };
}

export async function deleteRoom(id) {
  await query(`DELETE FROM studio_rooms WHERE id = ?`, [id]);
}

export async function updateRoom(id, name) {
  await query(`UPDATE studio_rooms SET name = ? WHERE id = ?`, [String(name || "").trim(), id]);
}

export async function getRoleSettings() {
  const [row, roles] = await Promise.all([
    queryOne(`SELECT roles_enabled AS rolesEnabled FROM studio_info WHERE id = 'main' LIMIT 1`),
    query(`SELECT id, name, sort_order AS sortOrder FROM studio_roles ORDER BY sort_order ASC, created_at ASC`),
  ]);
  return {
    rolesEnabled: row?.rolesEnabled ? true : false,
    roles: Array.isArray(roles) ? roles : [],
  };
}

export async function saveRoleEnabled(enabled) {
  await query(
    `INSERT INTO studio_info (id, roles_enabled, updated_at)
     VALUES ('main', ?, NOW())
     ON DUPLICATE KEY UPDATE roles_enabled = VALUES(roles_enabled), updated_at = NOW()`,
    [enabled ? 1 : 0]
  );
}

export async function createRole(name) {
  const id = randomUUID();
  const [countRow] = await query(`SELECT COUNT(*) AS cnt FROM studio_roles`);
  const sortOrder = (countRow?.cnt || 0);
  await query(
    `INSERT INTO studio_roles (id, name, sort_order, created_at) VALUES (?, ?, ?, NOW())`,
    [id, String(name || "").trim(), sortOrder]
  );
  return { id, name: String(name || "").trim(), sortOrder };
}

export async function deleteRole(id) {
  await query(`DELETE FROM studio_roles WHERE id = ?`, [id]);
}

export async function updateRole(id, name) {
  await query(`UPDATE studio_roles SET name = ? WHERE id = ?`, [String(name || "").trim(), id]);
}

export async function getMemberGradeSettings() {
  const [row, grades] = await Promise.all([
    queryOne(`SELECT member_grades_enabled AS memberGradesEnabled FROM studio_info WHERE id = 'main' LIMIT 1`),
    query(`SELECT id, name, color, sort_order AS sortOrder FROM studio_member_grades ORDER BY sort_order ASC, created_at ASC`),
  ]);
  return {
    memberGradesEnabled: row?.memberGradesEnabled ? true : false,
    grades: Array.isArray(grades) ? grades : [],
  };
}

export async function saveMemberGradeEnabled(enabled) {
  await query(
    `INSERT INTO studio_info (id, member_grades_enabled, updated_at)
     VALUES ('main', ?, NOW())
     ON DUPLICATE KEY UPDATE member_grades_enabled = VALUES(member_grades_enabled), updated_at = NOW()`,
    [enabled ? 1 : 0]
  );
}

export async function createMemberGrade(name, color) {
  const id = randomUUID();
  const [countRow] = await query(`SELECT COUNT(*) AS cnt FROM studio_member_grades`);
  await query(
    `INSERT INTO studio_member_grades (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, NOW())`,
    [id, String(name || "").trim(), String(color || "#f06292"), (countRow?.cnt || 0)]
  );
  return { id, name: String(name || "").trim(), color: String(color || "#f06292") };
}

export async function deleteMemberGrade(id) {
  await query(`DELETE FROM studio_member_grades WHERE id = ?`, [id]);
}

export async function updateMemberGrade(id, name, color) {
  await query(`UPDATE studio_member_grades SET name = ?, color = ? WHERE id = ?`, [String(name || "").trim(), String(color || "#f06292"), id]);
}

export async function listClassCategories() {
  const rows = await query(`SELECT id, name, sort_order AS sortOrder FROM studio_class_categories ORDER BY sort_order ASC, created_at ASC`);
  return Array.isArray(rows) ? rows : [];
}

export async function createClassCategory(name) {
  const id = randomUUID();
  const [countRow] = await query(`SELECT COUNT(*) AS cnt FROM studio_class_categories`);
  const sortOrder = (countRow?.cnt || 0);
  await query(`INSERT INTO studio_class_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, NOW())`, [id, String(name || "").trim(), sortOrder]);
  return { id, name: String(name || "").trim(), sortOrder };
}

export async function deleteClassCategory(id) {
  await query(`DELETE FROM studio_class_categories WHERE id = ?`, [id]);
}

export async function updateClassCategory(id, name) {
  await query(`UPDATE studio_class_categories SET name = ? WHERE id = ?`, [String(name || "").trim(), id]);
}

const NOTIFICATION_DEFAULTS = {
  pass_expire:       { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 잔여일이 [[수강권 잔여일]]일 남았습니다.",                                param1: 5,    param2: null, skipExpired: false },
  pass_count_expire: { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 잔여횟수가 [[수강권 잔여횟수]]회 남았습니다.",                           param1: 5,    param2: null, skipExpired: false },
  pass_pause_expire: { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[수강권명]]의 정지기간이 [[수강권 정지만료일]]일 남았습니다.",                          param1: 3,    param2: null, skipExpired: false },
  class_waitlist:    { pushEnabled: true,  smsEnabled: false, message: "[[수업 시작시간]] [[수업명]] [[강사명]] 강사 예약대기 수업이 예약되었습니다.",                         param1: null, param2: null, skipExpired: false },
  class_cancelled:   { pushEnabled: true,  smsEnabled: false, message: "최소 수강인원 미달로 [[수업 시작시간]] [[수업명]] [[강사명]] 강사 수업이 취소되었습니다.",              param1: null, param2: null, skipExpired: false },
  class_reminder:    { pushEnabled: true,  smsEnabled: false, message: "[[수업 시작시간]] [[수업명]] 수업 일정이 있습니다.",                                                   param1: 3,    param2: 3,    skipExpired: false },
  member_birthday:   { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! 생일을 축하드립니다. 행복한 하루 되세요!",                                               param1: null, param2: null, skipExpired: false },
  locker_expire:     { pushEnabled: true,  smsEnabled: false, message: "[[회원명]]님! [[락커 번호]]번 락커 만료일이 [[락커 종료일]]일 남았습니다.",                             param1: 3,    param2: null, skipExpired: false },
};

export async function getNotificationTemplates() {
  const rows = await query("SELECT * FROM studio_notification_templates");
  const byId = {};
  for (const row of rows) byId[row.template_id] = row;
  return Object.fromEntries(
    Object.entries(NOTIFICATION_DEFAULTS).map(([id, def]) => {
      const row = byId[id];
      return [id, {
        pushEnabled: row ? Boolean(row.push_enabled) : def.pushEnabled,
        smsEnabled:  row ? Boolean(row.sms_enabled)  : def.smsEnabled,
        message:     row ? row.message               : def.message,
        param1:      row ? row.param1                : def.param1,
        param2:      row ? row.param2                : def.param2,
        skipExpired: row ? Boolean(row.skip_expired) : def.skipExpired,
      }];
    })
  );
}

export async function saveNotificationTemplate(templateId, { pushEnabled, smsEnabled, message, param1, param2, skipExpired }) {
  if (!NOTIFICATION_DEFAULTS[templateId]) throw createHttpError("알 수 없는 템플릿 ID입니다.", 400);
  await query(
    `INSERT INTO studio_notification_templates (template_id, push_enabled, sms_enabled, message, param1, param2, skip_expired, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE push_enabled=VALUES(push_enabled), sms_enabled=VALUES(sms_enabled),
       message=VALUES(message), param1=VALUES(param1), param2=VALUES(param2),
       skip_expired=VALUES(skip_expired), updated_at=NOW()`,
    [templateId, pushEnabled ? 1 : 0, smsEnabled ? 1 : 0, String(message || ""), param1 ?? null, param2 ?? null, skipExpired ? 1 : 0]
  );
}

export async function addHoliday(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_holidays (id, holiday_date, title, note, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [id, String(payload?.holidayDate || "").trim(), String(payload?.title || "").trim(), String(payload?.note || "").trim()]
  );
}

export async function deleteHoliday(id) {
  await query(`DELETE FROM studio_holidays WHERE id = ?`, [id]);
}

export async function checkInMember(payload) {
  const classId = String(payload?.classId || "").trim();
  const userId = String(payload?.userId || "").trim();
  const bookingId = payload?.bookingId ? String(payload.bookingId).trim() : null;
  const existing = await queryOne(
    `SELECT id, class_id AS classId, user_id AS userId, booking_id AS bookingId, status, checked_in_at AS checkedInAt
     FROM studio_checkins
     WHERE class_id = ? AND user_id = ? AND status = 'checked_in'
     LIMIT 1`,
    [classId, userId]
  );
  if (existing?.id) return existing;

  const id = randomUUID();
  await query(
    `INSERT INTO studio_checkins
      (id, class_id, user_id, booking_id, status, checked_in_at, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      classId,
      userId,
      bookingId,
      String(payload?.status || "checked_in").trim(),
    ]
  );
  return queryOne(`SELECT * FROM studio_checkins WHERE id = ?`, [id]);
}

export async function listCheckinsByClass(classId) {
  const rows = await query(
    `SELECT id, class_id AS classId, user_id AS userId, booking_id AS bookingId, status, checked_in_at AS checkedInAt
     FROM studio_checkins
     WHERE class_id = ?
     ORDER BY checked_in_at ASC`,
    [classId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createArrears(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_arrears
      (id, user_id, amount, reason, status, due_date, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, NOW())`,
    [
      id,
      String(payload?.userId || "").trim(),
      Math.max(0, Number(payload?.amount || 0)),
      String(payload?.reason || "").trim() || "誘몄닔湲??깅줉",
      payload?.dueDate || null,
    ]
  );
  return queryOne(`SELECT * FROM studio_arrears WHERE id = ?`, [id]);
}

export async function resolveArrears(arrearsId) {
  await query(
    `UPDATE studio_arrears
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = ?`,
    [arrearsId]
  );
}

export async function listArrearsByUser(userId) {
  const rows = await query(
    `SELECT id, user_id AS userId, amount, reason, status, due_date AS dueDate, created_at AS createdAt, resolved_at AS resolvedAt
     FROM studio_arrears
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createLocker(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_lockers
      (id, locker_no, location, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      String(payload?.lockerNo || "").trim(),
      String(payload?.location || "").trim(),
      String(payload?.status || "available").trim(),
    ]
  );
  return queryOne(`SELECT * FROM studio_lockers WHERE id = ?`, [id]);
}

export async function listLockers() {
  const rows = await query(
    `SELECT id, locker_no AS lockerNo, location, status, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_lockers
     ORDER BY locker_no ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function updateLockerStatus(lockerId, status) {
  const allowed = new Set(["available", "occupied", "maintenance"]);
  if (!allowed.has(String(status || ""))) {
    throw createHttpError("Invalid locker status.", 400);
  }
  await query(
    `UPDATE studio_lockers
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, lockerId]
  );
  return queryOne(
    `SELECT id, locker_no AS lockerNo, location, status, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_lockers
     WHERE id = ?`,
    [lockerId]
  );
}

export async function listLockerAssignments({ userId = "", status = "active" } = {}) {
  const params = [];
  let where = " WHERE 1=1 ";
  if (userId) {
    where += " AND sla.user_id = ? ";
    params.push(userId);
  }
  if (status) {
    where += " AND sla.status = ? ";
    params.push(status);
  }
  const rows = await query(
    `SELECT
       sla.id,
       sla.locker_id AS lockerId,
       sl.locker_no AS lockerNo,
       sl.location,
       sla.user_id AS userId,
       u.login_id AS loginId,
       u.name,
       u.email,
       u.phone,
       sla.start_date AS startDate,
       sla.end_date AS endDate,
       sla.status,
       sla.created_at AS createdAt,
       sla.ended_at AS endedAt
     FROM studio_locker_assignments sla
     INNER JOIN studio_lockers sl ON sl.id = sla.locker_id
     LEFT JOIN users u ON u.id = sla.user_id
     ${where}
     ORDER BY sla.created_at DESC`,
    params
  );
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const user = decryptUserRow({
      id: row.userId,
      loginId: row.loginId,
      name: row.name,
      email: row.email,
      phone: row.phone,
    });
    return {
      id: row.id,
      lockerId: row.lockerId,
      lockerNo: row.lockerNo,
      location: row.location,
      userId: row.userId,
      userName: user?.name || row.loginId || row.userId,
      userEmail: user?.email || "",
      userPhone: user?.phone || "",
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      createdAt: row.createdAt,
      endedAt: row.endedAt,
    };
  });
}

export async function assignLocker(payload) {
  const id = randomUUID();
  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO studio_locker_assignments
        (id, locker_id, user_id, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
      [
        id,
        String(payload?.lockerId || "").trim(),
        String(payload?.userId || "").trim(),
        String(payload?.startDate || "").trim(),
        payload?.endDate || null,
      ]
    );
    await conn.execute(
      `UPDATE studio_lockers SET status = 'occupied', updated_at = NOW() WHERE id = ?`,
      [String(payload?.lockerId || "").trim()]
    );
  });
  return queryOne(`SELECT * FROM studio_locker_assignments WHERE id = ?`, [id]);
}

export async function endLockerAssignment(assignmentId) {
  const row = await queryOne(
    `SELECT locker_id AS lockerId FROM studio_locker_assignments WHERE id = ? LIMIT 1`,
    [assignmentId]
  );
  if (!row?.lockerId) return;
  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE studio_locker_assignments
       SET status = 'ended', ended_at = NOW()
       WHERE id = ?`,
      [assignmentId]
    );
    await conn.execute(
      `UPDATE studio_lockers
       SET status = 'available', updated_at = NOW()
       WHERE id = ?`,
      [row.lockerId]
    );
  });
}

export async function createNotification(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_notifications
      (id, user_id, type, title, message, status, scheduled_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      String(payload?.userId || "").trim(),
      String(payload?.type || "manual").trim(),
      String(payload?.title || "").trim(),
      String(payload?.message || "").trim(),
      String(payload?.status || "pending").trim(),
      payload?.scheduledAt || null,
    ]
  );
  return queryOne(`SELECT * FROM studio_notifications WHERE id = ?`, [id]);
}

export async function appendNotificationLog(payload) {
  await query(
    `INSERT INTO studio_notification_logs
      (id, notification_id, channel, result_status, provider_message_id, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      randomUUID(),
      String(payload?.notificationId || "").trim(),
      String(payload?.channel || "push").trim(),
      String(payload?.resultStatus || "sent").trim(),
      payload?.providerMessageId || null,
      payload?.errorMessage || null,
    ]
  );
}

export async function listNotificationsByUser(userId) {
  const rows = await query(
    `SELECT id, user_id AS userId, type, title, message, status, scheduled_at AS scheduledAt, sent_at AS sentAt, created_at AS createdAt
     FROM studio_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listInstructorHours() {
  const rows = await query(
    `SELECT id, instructor_name AS instructorName, weekday, start_time AS startTime, end_time AS endTime, is_off AS isOff, updated_at AS updatedAt
     FROM studio_instructor_hours
     ORDER BY instructor_name ASC, weekday ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function saveInstructorHours(items) {
  await withTransaction(async (conn) => {
    await conn.execute(`DELETE FROM studio_instructor_hours`);
    for (const item of Array.isArray(items) ? items : []) {
      await conn.execute(
        `INSERT INTO studio_instructor_hours
          (id, instructor_name, weekday, start_time, end_time, is_off, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          randomUUID(),
          String(item?.instructorName || "").trim(),
          Number(item?.weekday || 0),
          item?.startTime || "09:00:00",
          item?.endTime || "22:00:00",
          item?.isOff ? 1 : 0,
        ]
      );
    }
  });
}

export async function listRolePermissions() {
  const rows = await query(
    `SELECT id, role_code AS roleCode, permission_code AS permissionCode, is_allowed AS isAllowed, updated_at AS updatedAt
     FROM studio_role_permissions
     ORDER BY role_code ASC, permission_code ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function isRoleAllowed(roleCode, permissionCode) {
  if (!roleCode || !permissionCode) return false;
  const normalizedRole = String(roleCode).trim().toLowerCase();
  const ownerPermissions = new Set([
    "class.read",
    "class.write",
    "member.read",
    "member.write",
    "pass.write",
    "checkin.read",
    "checkin.write",
    "locker.read",
    "locker.write",
    "settings.read",
    "settings.write",
    "communication.read",
    "communication.write",
  ]);
  const managerPermissions = new Set(ownerPermissions);
  const instructorPermissions = new Set([
    "class.read",
    "member.read",
    "checkin.read",
    "checkin.write",
    "communication.read",
  ]);
  const row = await queryOne(
    `SELECT is_allowed AS isAllowed
     FROM studio_role_permissions
     WHERE role_code = ? AND permission_code = ?
     LIMIT 1`,
    [normalizedRole, String(permissionCode).trim()]
  );
  if (row) return Boolean(Number(row.isAllowed));
  if (["owner", "admin", "admin0", "admin1"].includes(normalizedRole)) return ownerPermissions.has(permissionCode);
  if (["manager", "staff"].includes(normalizedRole)) return managerPermissions.has(permissionCode);
  if (["instructor", "teacher"].includes(normalizedRole)) return instructorPermissions.has(permissionCode);
  return false;
}

export async function saveRolePermissions(items) {
  await withTransaction(async (conn) => {
    await conn.execute(`DELETE FROM studio_role_permissions`);
    for (const item of Array.isArray(items) ? items : []) {
      await conn.execute(
        `INSERT INTO studio_role_permissions
          (id, role_code, permission_code, is_allowed, updated_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [randomUUID(), String(item?.roleCode || "").trim(), String(item?.permissionCode || "").trim(), item?.isAllowed ? 1 : 0]
      );
    }
  });
}

export async function listMemberMemos(userId) {
  const rows = await query(
    `SELECT id, user_id AS userId, author_id AS authorId, memo, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_member_memos
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createMemberMemo(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_member_memos (id, user_id, author_id, memo, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [id, String(payload?.userId || "").trim(), String(payload?.authorId || "").trim(), String(payload?.memo || "").trim()]
  );
  return queryOne(`SELECT * FROM studio_member_memos WHERE id = ?`, [id]);
}

export async function pausePass(payload) {
  const id = randomUUID();
  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO studio_pass_pauses
        (id, pass_id, user_id, start_date, end_date, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        String(payload?.passId || "").trim(),
        String(payload?.userId || "").trim(),
        String(payload?.startDate || "").trim(),
        String(payload?.endDate || "").trim(),
        String(payload?.reason || "").trim(),
      ]
    );
    await conn.execute(`UPDATE studio_passes SET status = 'paused', updated_at = NOW() WHERE id = ?`, [String(payload?.passId || "").trim()]);
  });
}

export async function transferPass(payload) {
  const id = randomUUID();
  await withTransaction(async (conn) => {
    const passId = String(payload?.passId || "").trim();
    const fromUserId = String(payload?.fromUserId || "").trim();
    const toUserId = String(payload?.toUserId || "").trim();
    const requestedCount = Math.max(0, Number(payload?.transferCount || 0));
    if (!passId || !fromUserId || !toUserId || requestedCount <= 0) {
      throw createHttpError("수강권 양도 정보가 올바르지 않습니다.", 400);
    }

    const targetRows = await conn.execute(
      `SELECT id FROM users WHERE id = ? AND account_status = 'active' LIMIT 1`,
      [toUserId]
    );
    if (!targetRows?.[0]?.[0]?.id) {
      throw createHttpError("양도 받을 회원을 찾을 수 없습니다.", 404);
    }

    const passRows = await conn.execute(
      `SELECT id, user_id AS userId, pass_name AS passName, pass_type AS passType,
              remaining_count AS remainingCount, expires_at AS expiresAt
       FROM studio_passes
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [passId, fromUserId]
    );
    const sourcePass = passRows?.[0]?.[0] || null;
    if (!sourcePass) {
      throw createHttpError("양도할 수강권을 찾을 수 없습니다.", 404);
    }

    const transferCount = Math.min(requestedCount, Math.max(0, Number(sourcePass.remainingCount || 0)));
    if (transferCount <= 0) {
      throw createHttpError("양도 가능한 잔여 횟수가 없습니다.", 400);
    }

    await conn.execute(
      `INSERT INTO studio_pass_transfers
        (id, pass_id, from_user_id, to_user_id, transfer_count, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        passId,
        fromUserId,
        toUserId,
        transferCount,
        String(payload?.reason || "").trim(),
      ]
    );

    const newPassId = randomUUID();
    await conn.execute(
      `INSERT INTO studio_passes
        (id, user_id, pass_name, pass_type, remaining_count, total_count, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        newPassId,
        toUserId,
        `${sourcePass.passName || "수강권"} 양도`,
        sourcePass.passType || "group",
        transferCount,
        transferCount,
        sourcePass.expiresAt || null,
      ]
    );

    const nextRemaining = Math.max(0, Number(sourcePass.remainingCount || 0) - transferCount);
    await conn.execute(
      `UPDATE studio_passes
       SET remaining_count = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextRemaining, nextRemaining <= 0 ? "transferred" : "active", passId]
    );
  });
}

export async function requestPassRefund(payload) {
  const id = randomUUID();
  await query(
    `INSERT INTO studio_pass_refunds
      (id, pass_id, user_id, refund_amount, reason, status, requested_at)
     VALUES (?, ?, ?, ?, ?, 'requested', NOW())`,
    [
      id,
      String(payload?.passId || "").trim(),
      String(payload?.userId || "").trim(),
      Math.max(0, Number(payload?.refundAmount || 0)),
      String(payload?.reason || "").trim(),
    ]
  );
  return queryOne(`SELECT * FROM studio_pass_refunds WHERE id = ?`, [id]);
}

export async function listPassRefunds({ status } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("r.status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `SELECT r.id, r.pass_id AS passId, r.user_id AS userId,
            r.refund_amount AS refundAmount, r.reason, r.status,
            r.requested_at AS requestedAt, r.resolved_at AS resolvedAt,
            u.email AS customerEmail, u.name AS customerName,
            p.pass_name AS passName
     FROM studio_pass_refunds r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN studio_passes p ON p.id = r.pass_id
     ${where}
     ORDER BY r.requested_at DESC`,
    params
  );
  // users 테이블의 이메일·이름은 암호화 저장되어 있으므로 복호화해서 반환합니다
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    customerEmail: normalizeEmail(decryptPii(row.customerEmail)),
    customerName: decryptPii(row.customerName),
  }));
}

export async function resolvePassRefund(refundId, status) {
  const row = await queryOne(`SELECT pass_id AS passId FROM studio_pass_refunds WHERE id = ? LIMIT 1`, [refundId]);
  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE studio_pass_refunds
       SET status = ?, resolved_at = NOW()
       WHERE id = ?`,
      [status, refundId]
    );
    if (status === "approved" && row?.passId) {
      await conn.execute(`UPDATE studio_passes SET status = 'refunded', updated_at = NOW() WHERE id = ?`, [row.passId]);
    }
  });
}

// ── 게시판 (공지사항) ──────────────────────────────────────────────

function toSqlTs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function mapNoticeRow(row) {
  let images = [];
  try { images = row.images ? (typeof row.images === "string" ? JSON.parse(row.images) : row.images) : []; } catch (_) {}
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    content: String(row.content || ""),
    images: Array.isArray(images) ? images : [],
    popupEnabled: Boolean(row.popupEnabled),
    pinned: Boolean(row.pinned),
    target: String(row.target || "active"),
    postTiming: String(row.postTiming || "now"),
    startAt: row.startAt ? new Date(row.startAt).toISOString() : null,
    endAt: row.endAt ? new Date(row.endAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    authorId: String(row.authorId || ""),
    authorName: row.authorName ? decryptPii(row.authorName) : "",
    authorRole: String(row.authorRole || ""),
  };
}

export async function listAdminNotices({ search, page = 1, pageSize = 20 } = {}) {
  const conditions = [];
  const params = [];
  if (search && search.trim()) {
    conditions.push(`(n.title LIKE ?)`);
    params.push(`%${search.trim()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (Math.max(1, page) - 1) * pageSize;

  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 20)));
  const safeOffset = Math.max(0, Math.floor(offset));

  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total FROM studio_notices n ${where}`, params),
    query(
      `SELECT n.id, n.title, n.popup_enabled AS popupEnabled, n.pinned,
              n.target, n.post_timing AS postTiming,
              n.start_at AS startAt, n.end_at AS endAt,
              n.created_at AS createdAt,
              u.id AS authorId, u.name AS authorName, u.role AS authorRole
       FROM studio_notices n
       LEFT JOIN users u ON u.id = n.author_id
       ${where}
       ORDER BY n.pinned DESC, n.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    ),
  ]);

  return {
    notices: (Array.isArray(rows) ? rows : []).map(mapNoticeRow),
    total: Number(countRow?.total ?? 0),
  };
}

export async function getAdminNotice(noticeId) {
  const row = await queryOne(
    `SELECT n.id, n.title, n.content, n.images, n.popup_enabled AS popupEnabled, n.pinned,
            n.target, n.post_timing AS postTiming,
            n.start_at AS startAt, n.end_at AS endAt,
            n.created_at AS createdAt, n.updated_at AS updatedAt,
            u.id AS authorId, u.name AS authorName, u.role AS authorRole
     FROM studio_notices n
     LEFT JOIN users u ON u.id = n.author_id
     WHERE n.id = ? LIMIT 1`,
    [noticeId]
  );
  if (!row) { const e = new Error("게시글을 찾을 수 없습니다."); e.status = 404; throw e; }
  return mapNoticeRow(row);
}

function normalizeNoticePayload(payload) {
  const title = String(payload.title || "").trim();
  if (!title) { const e = new Error("제목을 입력해 주세요."); e.status = 400; throw e; }
  const content = String(payload.content || "").trim();
  const images = JSON.stringify(
    Array.isArray(payload.images)
      ? payload.images.filter((u) => typeof u === "string" && u.startsWith("/uploads/notices/")).slice(0, 3)
      : []
  );
  const popupEnabled = payload.popupEnabled ? 1 : 0;
  const pinned = payload.pinned ? 1 : 0;
  const target = ["active", "expired", "both"].includes(payload.target) ? payload.target : "active";
  const postTiming = ["now", "scheduled", "none", "unlimited"].includes(payload.postTiming) ? payload.postTiming : "now";
  const startAt = postTiming === "scheduled" ? toSqlTs(payload.startAt) : postTiming === "now" ? toSqlTs(new Date()) : null;
  const endAt = (postTiming === "now" || postTiming === "scheduled") ? toSqlTs(payload.endAt) : null;
  return { title, content, images, popupEnabled, pinned, target, postTiming, startAt, endAt };
}

export async function createAdminNotice(authorId, payload) {
  const id = randomUUID();
  const { title, content, images, popupEnabled, pinned, target, postTiming, startAt, endAt } = normalizeNoticePayload(payload);
  await query(
    `INSERT INTO studio_notices (id, title, content, images, author_id, popup_enabled, pinned, target, post_timing, start_at, end_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, title, content, images, authorId, popupEnabled, pinned, target, postTiming, startAt, endAt]
  );
  return getAdminNotice(id);
}

export async function updateAdminNotice(noticeId, payload) {
  const { title, content, images, popupEnabled, pinned, target, postTiming, startAt, endAt } = normalizeNoticePayload(payload);
  const result = await query(
    `UPDATE studio_notices SET title=?, content=?, images=?, popup_enabled=?, pinned=?, target=?, post_timing=?, start_at=?, end_at=?, updated_at=NOW()
     WHERE id=?`,
    [title, content, images, popupEnabled, pinned, target, postTiming, startAt, endAt, noticeId]
  );
  if (!result?.affectedRows) { const e = new Error("게시글을 찾을 수 없습니다."); e.status = 404; throw e; }
  return getAdminNotice(noticeId);
}

export async function deleteAdminNotices(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { deletedCount: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const result = await query(`DELETE FROM studio_notices WHERE id IN (${placeholders})`, ids);
  return { deletedCount: result?.affectedRows ?? 0 };
}
