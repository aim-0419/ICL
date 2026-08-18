import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../shared/db/mysql.js";
import { decryptPii, decryptUserRow, normalizeEmail } from "../../shared/security/pii.js";
import {
  isPassCompatibleWithClass,
  normalizeClassInput,
  normalizeOptionalCount,
  resolveBookingStatus,
  resolveIssuedPassType,
} from "./studio.class-rules.js";
import { normalizePassRefundRequest } from "./studio.refund-rules.js";
import { parseJson } from "../../shared/utils/payload.js";

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createHttpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const VALID_STUDIO_BRANCH_IDS = new Set(["branch-1", "branch-2"]);

function normalizeBranchId(value) {
  const branchId = String(value || "").trim();
  return VALID_STUDIO_BRANCH_IDS.has(branchId) ? branchId : "branch-1";
}

function branchNameExpr(alias = "sc") {
  return `COALESCE(b.name, CASE ${alias}.branch_id WHEN 'branch-2' THEN '효천점' ELSE '장덕점' END)`;
}

// 지금 사용할 수 있는 수강권을 뽑는 공통 SELECT입니다.
// 사용 가능 조건은 활성 상태, 잔여 횟수 1회 이상, 만료 전(만료일 없음 포함)입니다.
// studio_pass_products를 LEFT JOIN 하는 이유는, 상품 연결 이전에 발급된 기존 수강권도
// 함께 조회해야 하기 때문입니다. 그런 수강권은 productClassType이 null로 나옵니다.
const USABLE_PASS_SELECT = `SELECT
    sp.id,
    sp.branch_id AS branchId,
    sp.pass_type AS passType,
    sp.remaining_count AS remainingCount,
    spp.class_type AS productClassType,
    spp.capacity AS productCapacity
  FROM studio_passes sp
  LEFT JOIN studio_pass_products spp ON spp.id = sp.pass_product_id
  WHERE sp.user_id = ?
    AND sp.status = 'active'
    AND sp.remaining_count > 0
    AND (sp.expires_at IS NULL OR sp.expires_at >= NOW())`;

// 함수 역할: 이 수업에 실제로 쓸 수 있는 수강권 한 장을 트랜잭션 안에서 찾아 잠급니다.
//
// 지점이 같은 수강권을 만료 임박 순으로 정렬한 뒤, 수업 형태와 정원까지 맞는 첫 장을 고릅니다.
// 정렬 기준은 만료일 없는 것을 뒤로, 만료일이 이른 것을 먼저 써서 소멸을 줄이는 것입니다.
//
// FOR UPDATE로 잠그는 이유는 동시에 두 번 예약이 들어와도 같은 수강권이
// 두 번 차감되지 않게 하기 위해서입니다. 반드시 트랜잭션 커넥션으로 호출해야 합니다.
async function findCompatiblePassWithConn(conn, { userId, classInfo }) {
  const [rows] = await conn.execute(
    `${USABLE_PASS_SELECT}
     AND sp.branch_id = ?
     ORDER BY sp.expires_at IS NULL DESC, sp.expires_at ASC, sp.created_at ASC
     FOR UPDATE`,
    [userId, normalizeBranchId(classInfo.branchId)],
  );
  return (Array.isArray(rows) ? rows : []).find((pass) => isPassCompatibleWithClass(pass, classInfo)) || null;
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

async function assertBookingPolicyAllows(conn, classInfo, action) {
  const classStartAt = classInfo?.start_at ?? classInfo?.startAt ?? classInfo;
  const start = normalizeDate(classStartAt);
  if (!start) throw createHttpError("수업 시작 시간을 확인할 수 없습니다.", 400);
  const classDeadline = action === "cancel"
    ? normalizeDate(classInfo?.cancellation_deadline_at ?? classInfo?.cancellationDeadlineAt)
    : normalizeDate(classInfo?.booking_deadline_at ?? classInfo?.bookingDeadlineAt);
  if (classDeadline) {
    if (Date.now() > classDeadline.getTime()) {
      throw createHttpError(action === "cancel" ? "취소 가능 시간이 지났습니다." : "예약 가능 시간이 지났습니다.", 400);
    }
    return;
  }
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
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW())`,
    [
      id,
      String(payload?.userId || "").trim(),
      String(payload?.type || "system").trim(),
      String(payload?.title || "").trim(),
      String(payload?.message || "").trim(),
      String(payload?.status || "pending").trim(),
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

export async function listClasses({ from = "", to = "", userId = "", branchId = "" } = {}) {
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
  if (branchId) {
    where += " AND sc.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  const rows = await query(
    `SELECT
      sc.id,
      sc.branch_id AS branchId,
      ${branchNameExpr("sc")} AS branchName,
      sc.class_type AS classType,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt,
      sc.end_at AS endAt,
      sc.capacity,
      sc.min_capacity AS minCapacity,
      sc.waitlist_capacity AS waitlistCapacity,
      sc.booking_deadline_at AS bookingDeadlineAt,
      sc.cancellation_deadline_at AS cancellationDeadlineAt,
      sc.cancellation_decision_at AS cancellationDecisionAt,
      sc.status,
      SUM(CASE WHEN sb.status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount,
      SUM(CASE WHEN sb.status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlistCount
    FROM studio_classes sc
    LEFT JOIN branches b ON b.id = sc.branch_id
    LEFT JOIN studio_bookings sb ON sb.class_id = sc.id
    ${where}
    GROUP BY sc.id
    ORDER BY sc.start_at ASC`,
    params
  );

  // 로그인 회원이면 내 예약 현황과 사용 가능 수강권을 함께 읽습니다.
  // 두 조회는 서로 의존하지 않으므로 Promise.all로 동시에 보냅니다.
  // 여기서는 목록 표시용이라 지점 조건 없이 전부 가져오고, 지점 비교는 아래에서 합니다.
  let myBookings = [];
  let usablePasses = [];
  if (userId) {
    [myBookings, usablePasses] = await Promise.all([
      query(
        `SELECT class_id AS classId, status
         FROM studio_bookings
         WHERE user_id = ? AND status IN ('reserved','waitlisted')`,
        [userId],
      ),
      query(
        `${USABLE_PASS_SELECT}
         ORDER BY sp.expires_at IS NULL DESC, sp.expires_at ASC, sp.created_at ASC`,
        [userId],
      ),
    ]);
  }
  const myMap = new Map(myBookings.map((b) => [String(b.classId), String(b.status)]));
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const myStatus = myMap.get(String(row.id)) || "available";
      // canBook은 화면에서 예약 버튼을 열지 결정하는 표시용 값입니다.
      // 비로그인 상태에서는 로그인 유도를 위해 true로 두고, 로그인 상태에서는
      // 같은 지점에 이 수업에 맞는 수강권이 한 장이라도 있어야 true가 됩니다.
      // 실제 차감 가능 여부는 예약 시점에 findCompatiblePassWithConn이 다시 확인합니다.
      const canBook = !userId || (Array.isArray(usablePasses) && usablePasses.some(
        (pass) => String(pass.branchId) === String(row.branchId) && isPassCompatibleWithClass(pass, row),
      ));
      return {
        ...row,
        reservedCount: toCount(row.reservedCount),
        waitlistCount: toCount(row.waitlistCount),
        myStatus,
        canBook,
      };
    })
    .filter((row) => !userId || row.myStatus !== "available" || row.canBook);
}

export async function listClassesForAdmin({ from = "", to = "", status = "", branchId = "" } = {}) {
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
  if (branchId) {
    where += " AND sc.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  const rows = await query(
    `SELECT
      sc.id,
      sc.branch_id AS branchId,
      ${branchNameExpr("sc")} AS branchName,
      sc.class_type AS classType,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt,
      sc.end_at AS endAt,
      sc.capacity,
      sc.min_capacity AS minCapacity,
      sc.waitlist_capacity AS waitlistCapacity,
      sc.booking_deadline_at AS bookingDeadlineAt,
      sc.cancellation_deadline_at AS cancellationDeadlineAt,
      sc.cancellation_decision_at AS cancellationDecisionAt,
      sc.status,
      sc.updated_at AS updatedAt,
      SUM(CASE WHEN sb.status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount,
      SUM(CASE WHEN sb.status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlistCount
    FROM studio_classes sc
    LEFT JOIN branches b ON b.id = sc.branch_id
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

export async function listMyPasses(userId, branchId = "") {
  const params = [userId];
  let branchWhere = "";
  if (branchId) {
    branchWhere = " AND sp.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  const rows = await query(
    `SELECT sp.id, sp.branch_id AS branchId, ${branchNameExpr("sp")} AS branchName,
            sp.pass_name AS passName, sp.pass_type AS passType, sp.remaining_count AS remainingCount,
            sp.total_count AS totalCount, sp.expires_at AS expiresAt, sp.status,
            sp.pass_product_id AS passProductId,
            spp.class_type AS classType,
            spp.capacity
     FROM studio_passes sp
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN studio_pass_products spp ON spp.id = sp.pass_product_id
     WHERE sp.user_id = ?
       ${branchWhere}
     ORDER BY sp.created_at DESC`,
    params
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listMyPassTransactions(userId, branchId = "") {
  const params = [userId];
  let branchWhere = "";
  if (branchId) {
    branchWhere = " AND sp.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  const rows = await query(
    `SELECT
       spt.id,
       spt.pass_id AS passId,
       sp.branch_id AS branchId,
       ${branchNameExpr("sp")} AS branchName,
       sp.pass_name AS passName,
       spt.class_id AS classId,
       sc.title AS classTitle,
       spt.delta_count AS deltaCount,
       spt.reason,
       spt.created_at AS createdAt
     FROM studio_pass_transactions spt
     INNER JOIN studio_passes sp ON sp.id = spt.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN studio_classes sc ON sc.id = spt.class_id
     WHERE spt.user_id = ?
       ${branchWhere}
     ORDER BY spt.created_at DESC
     LIMIT 50`,
    params
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listPassTransactionsForAdmin({ limit = 200, date = "" } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Number.parseInt(String(limit || 200), 10) || 200));
  const conditions = [];
  const params = [];
  if (date) {
    conditions.push("DATE(spt.created_at) = ?");
    params.push(String(date).slice(0, 10));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `SELECT
       spt.id,
       spt.user_id AS userId,
       u.name,
       u.login_id AS loginId,
       u.phone,
       spt.pass_id AS passId,
       sp.branch_id AS branchId,
       ${branchNameExpr("sp")} AS branchName,
       sp.pass_name AS passName,
       sp.pass_type AS passType,
       spt.class_id AS classId,
       sc.title AS classTitle,
       spt.delta_count AS deltaCount,
       spt.reason,
       spt.created_at AS createdAt
     FROM studio_pass_transactions spt
     INNER JOIN studio_passes sp ON sp.id = spt.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN users u ON u.id = spt.user_id
     LEFT JOIN studio_classes sc ON sc.id = spt.class_id
     ${where}
     ORDER BY spt.created_at DESC
     LIMIT ${safeLimit}`,
    params
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
      branchId: row.branchId || "branch-1",
      branchName: row.branchName || "장덕점",
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

export async function listMyBookings(userId, branchId = "") {
  const params = [userId];
  let branchWhere = "";
  if (branchId) {
    branchWhere = " AND sc.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  const rows = await query(
    `SELECT
      sb.id,
      sb.class_id AS classId,
      sb.status,
      sb.booked_at AS bookedAt,
      sc.branch_id AS branchId,
      ${branchNameExpr("sc")} AS branchName,
      sc.title,
      sc.instructor_name AS instructorName,
      sc.room_name AS roomName,
      sc.start_at AS startAt
     FROM studio_bookings sb
     INNER JOIN studio_classes sc ON sc.id = sb.class_id
     LEFT JOIN branches b ON b.id = sc.branch_id
     WHERE sb.user_id = ? AND sb.status IN ('reserved','waitlisted')
       ${branchWhere}
     ORDER BY sc.start_at ASC`,
    params
  );
  return Array.isArray(rows) ? rows : [];
}

export async function bookClass({ userId, classId }) {
  return withTransaction(async (conn) => {
    const classRows = await conn.execute(
      `SELECT id, branch_id AS branchId, class_type AS classType, title, start_at, end_at, capacity, waitlist_capacity, booking_deadline_at, status
       FROM studio_classes
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [classId]
    );
    const classInfo = classRows?.[0]?.[0] || null;
    if (!classInfo) throw createHttpError("수업을 찾을 수 없습니다.", 404);
    if (String(classInfo.status) !== "active") throw createHttpError("현재 예약할 수 없는 수업입니다.", 400);

    assertFutureClass(classInfo.start_at);
    await assertStudioOpenForClass({ startAt: classInfo.start_at, endAt: classInfo.end_at, conn });
    await assertBookingPolicyAllows(conn, classInfo, "book");

    const existRows = await conn.execute(
      `SELECT id, status
       FROM studio_bookings
       WHERE class_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [classId, userId]
    );
    const exist = existRows?.[0]?.[0] || null;
    if (exist && (exist.status === "reserved" || exist.status === "waitlisted")) {
      throw createHttpError("이미 예약했거나 대기 신청한 수업입니다.", 409);
    }

    const pass = await findCompatiblePassWithConn(conn, { userId, classInfo });
    if (!pass) throw createHttpError("이 수업에 사용할 수 있는 수강권이 없습니다.", 400);

    const cntRows = await conn.execute(
      `SELECT
         SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reservedCount,
         SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END) AS waitlistCount
       FROM studio_bookings
       WHERE class_id = ?`,
      [classId]
    );
    const reservedCount = toCount(cntRows?.[0]?.[0]?.reservedCount);
    const waitlistCount = toCount(cntRows?.[0]?.[0]?.waitlistCount);
    const bookingStatus = resolveBookingStatus({
      reservedCount,
      capacity: classInfo.capacity,
      waitlistCount,
      waitlistCapacity: classInfo.waitlist_capacity,
    });
    const isReserved = bookingStatus === "reserved";
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
      title: bookingStatus === "reserved" ? "예약 확정" : "예약 대기 등록",
      message: `${classInfo.title || "수업"} ${bookingStatus === "reserved" ? "예약이 확정되었습니다." : "대기 명단에 등록되었습니다."}`,
    });

    return { bookingStatus };
  });
}

export async function cancelMyBooking({ userId, classId }) {
  return withTransaction(async (conn) => {
    const classRows = await conn.execute(
      `SELECT title, branch_id AS branchId, class_type AS classType, capacity,
              start_at AS startAt, cancellation_deadline_at AS cancellationDeadlineAt
       FROM studio_classes
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [classId]
    );
    const classInfo = classRows?.[0]?.[0] || null;
    if (!classInfo) throw createHttpError("수업을 찾을 수 없습니다.", 404);

    const rows = await conn.execute(
      `SELECT id, status, pass_id AS passId
       FROM studio_bookings
       WHERE class_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [classId, userId]
    );
    const bookingRow = rows?.[0]?.[0] || null;
    const booking = bookingRow ? { ...bookingRow, ...classInfo } : null;
    if (!booking || !["reserved", "waitlisted"].includes(String(booking.status))) {
      throw createHttpError("취소할 수 있는 예약 또는 대기 내역이 없습니다.", 404);
    }

    await assertBookingPolicyAllows(conn, booking, "cancel");
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
        title: "예약 취소",
        message: `${booking.title || "수업"} 예약이 취소되었습니다.`,
      });

      const waitRows = await conn.execute(
        `SELECT id, user_id AS userId
         FROM studio_bookings
         WHERE class_id = ? AND status = 'waitlisted'
         ORDER BY booked_at ASC
         LIMIT 1
         FOR UPDATE`,
        [classId]
      );
      const waiter = waitRows?.[0]?.[0] || null;
      if (waiter) {
        const waiterPass = await findCompatiblePassWithConn(conn, {
          userId: waiter.userId,
          classInfo,
        });
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
            title: "예약 확정",
            message: `${booking.title || "수업"} 대기 예약이 확정되었습니다.`,
          });
        }
      }
    } else {
      await createNotificationWithConn(conn, {
        userId,
        type: "booking_cancelled",
        title: "예약 대기 취소",
        message: `${booking.title || "수업"} 대기 신청이 취소되었습니다.`,
      });
    }
    return { ok: true };
  });
}

export async function createClass(payload, userId) {
  const classData = normalizeClassInput(payload);
  await assertStudioOpenForClass({ startAt: classData.startAt, endAt: classData.endAt });
  const id = randomUUID();
  await query(
    `INSERT INTO studio_classes
      (id, branch_id, class_type, title, instructor_name, room_name, start_at, end_at, capacity,
       min_capacity, waitlist_capacity, booking_deadline_at, cancellation_deadline_at, cancellation_decision_at,
       status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
    [
      id,
      classData.branchId,
      classData.classType,
      classData.title,
      classData.instructorName,
      classData.roomName,
      classData.startAt,
      classData.endAt,
      classData.capacity,
      classData.minCapacity,
      classData.waitlistCapacity,
      classData.bookingDeadlineAt,
      classData.cancellationDeadlineAt,
      classData.cancellationDecisionAt,
      userId,
    ]
  );
  return queryOne(`SELECT * FROM studio_classes WHERE id = ?`, [id]);
}

export async function createClassesWithRepeat(payload, userId) {
  const classData = normalizeClassInput(payload);
  const repeatWeeks = Math.max(1, Math.min(24, Number(payload?.repeatWeeks || 1)));
  const startBase = classData.startAt;
  const endBase = classData.endAt;
  const addWeeks = (date, weeks) => date ? new Date(date.getTime() + weeks * 7 * 86400000) : null;

  const recurrenceId = repeatWeeks > 1 ? randomUUID() : null;
  const rows = [];
  for (let i = 0; i < repeatWeeks; i += 1) {
    const start = new Date(startBase.getTime() + i * 7 * 86400000);
    const end = new Date(endBase.getTime() + i * 7 * 86400000);
    await assertStudioOpenForClass({ startAt: start, endAt: end });
    const id = randomUUID();
    await query(
      `INSERT INTO studio_classes
        (id, branch_id, class_type, title, instructor_name, room_name, start_at, end_at, capacity,
         min_capacity, waitlist_capacity, booking_deadline_at, cancellation_deadline_at, cancellation_decision_at,
         status, repeat_group_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(), NOW())`,
      [
        id,
        classData.branchId,
        classData.classType,
        classData.title,
        classData.instructorName,
        classData.roomName,
        start,
        end,
        classData.capacity,
        classData.minCapacity,
        classData.waitlistCapacity,
        addWeeks(classData.bookingDeadlineAt, i),
        addWeeks(classData.cancellationDeadlineAt, i),
        addWeeks(classData.cancellationDecisionAt, i),
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
  const classData = normalizeClassInput(payload);
  await assertStudioOpenForClass({ startAt: classData.startAt, endAt: classData.endAt });
  await query(
    `UPDATE studio_classes
     SET branch_id = ?, class_type = ?, title = ?, instructor_name = ?, room_name = ?, start_at = ?, end_at = ?, capacity = ?,
         min_capacity = ?, waitlist_capacity = ?, booking_deadline_at = ?, cancellation_deadline_at = ?,
         cancellation_decision_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      classData.branchId,
      classData.classType,
      classData.title,
      classData.instructorName,
      classData.roomName,
      classData.startAt,
      classData.endAt,
      classData.capacity,
      classData.minCapacity,
      classData.waitlistCapacity,
      classData.bookingDeadlineAt,
      classData.cancellationDeadlineAt,
      classData.cancellationDecisionAt,
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
export async function listAllBookingsForAdmin({ from = "", to = "", status = "", branchId = "", classStatus = "" } = {}) {
  const params = [];
  let where = " WHERE 1=1 ";
  if (from) { where += " AND sc.start_at >= ? "; params.push(from); }
  if (to)   { where += " AND sc.start_at <= ? "; params.push(to); }
  if (status && ["reserved", "waitlisted", "cancelled"].includes(status)) {
    where += " AND sb.status = ? ";
    params.push(status);
  }
  if (branchId) {
    where += " AND sc.branch_id = ? ";
    params.push(normalizeBranchId(branchId));
  }
  if (classStatus) {
    const allowed = ["active", "cancelled", "deleted"];
    const statuses = classStatus.split(",").map((s) => s.trim()).filter((s) => allowed.includes(s));
    if (statuses.length === 1) {
      where += " AND sc.status = ? ";
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      where += ` AND sc.status IN (${statuses.map(() => "?").join(",")}) `;
      params.push(...statuses);
    }
  } else {
    where += " AND sc.status = 'active' ";
  }

  const rows = await query(
    `SELECT
       sb.id,
       sb.class_id AS classId,
       sb.user_id AS userId,
       sb.status,
       sb.booked_at AS bookedAt,
       sc.branch_id AS branchId,
       sc.status AS classStatus,
       ${branchNameExpr("sc")} AS branchName,
       sc.class_type AS classType,
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
       sp.total_count AS totalCount,
       sp.status AS passStatus,
       sp.expires_at AS passExpiresAt,
       COALESCE(sa.openAmount, 0) AS openArrearsAmount
     FROM studio_bookings sb
     JOIN studio_classes sc ON sc.id = sb.class_id
     LEFT JOIN branches b ON b.id = sc.branch_id
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
      branchId: row.branchId || "branch-1",
      branchName: row.branchName || "장덕점",
      classType: row.classType || "group",
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
      totalCount: toCount(row.totalCount),
      passStatus: row.passStatus || "",
      passExpiresAt: row.passExpiresAt || null,
      openArrearsAmount: Number(row.openArrearsAmount || 0),
    };
  });
}

export async function createPassByAdmin(payload) {
  const id = randomUUID();
  const userId = String(payload?.userId || "").trim();
  const passProductId = String(payload?.passProductId || "").trim() || null;
  let branchId = normalizeBranchId(payload?.branchId);
  let passName = String(payload?.passName || "").trim();
  let totalCount = Math.max(0, Number(payload?.totalCount || 0));
  let remainingCount = Math.max(0, Number(payload?.remainingCount ?? payload?.totalCount ?? 0));
  let passType = resolveIssuedPassType({ passType: payload?.passType });
  let expiresAt = payload?.expiresAt || null;
  const amount = Math.max(0, Number(payload?.amount || 0));
  if (!userId) {
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

    if (passProductId) {
      const [productRows] = await conn.execute(
        `SELECT id, branch_id AS branchId, name, class_type AS classType,
                capacity, total_count AS totalCount, valid_days AS validDays
         FROM studio_pass_products
         WHERE id = ? AND status = 'active'
         LIMIT 1`,
        [passProductId],
      );
      const product = productRows?.[0] || null;
      if (!product) throw createHttpError("사용 가능한 수강권 상품을 찾을 수 없습니다.", 404);

      branchId = normalizeBranchId(product.branchId);
      passName = String(product.name || passName).trim();
      totalCount = totalCount > 0 ? totalCount : Math.max(0, Number(product.totalCount || 0));
      remainingCount = Math.min(remainingCount || totalCount, totalCount);
      passType = resolveIssuedPassType(product);
      if (!expiresAt && Number(product.validDays) > 0) {
        expiresAt = new Date(Date.now() + Number(product.validDays) * 86400000);
      }
    }

    if (!passName || totalCount <= 0 || remainingCount > totalCount) {
      throw createHttpError("수강권 생성 정보가 올바르지 않습니다.", 400);
    }

    await conn.execute(
      `INSERT INTO studio_passes
        (id, user_id, branch_id, pass_name, pass_type, remaining_count, total_count, expires_at,
         pass_product_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        id,
        userId,
        branchId,
        passName,
        passType,
        remainingCount,
        totalCount,
        expiresAt,
        passProductId,
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
    `SELECT studio_passes.id,
            studio_passes.branch_id AS branchId,
            ${branchNameExpr("studio_passes")} AS branchName,
            studio_passes.pass_name AS passName,
            studio_passes.pass_type AS passType,
            studio_passes.remaining_count AS remainingCount,
            studio_passes.total_count AS totalCount,
            studio_passes.expires_at AS expiresAt,
            studio_passes.status,
            studio_passes.created_at AS createdAt,
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
     LEFT JOIN branches b ON b.id = studio_passes.branch_id
     WHERE studio_passes.id = ?`,
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
    `SELECT studio_passes.id,
            studio_passes.branch_id AS branchId,
            ${branchNameExpr("studio_passes")} AS branchName,
            studio_passes.pass_name AS passName, studio_passes.pass_type AS passType, studio_passes.remaining_count AS remainingCount,
            studio_passes.total_count AS totalCount, studio_passes.expires_at AS expiresAt, studio_passes.status, studio_passes.created_at AS createdAt,
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
     LEFT JOIN branches b ON b.id = studio_passes.branch_id
     WHERE user_id = ?
     ORDER BY studio_passes.created_at DESC`,
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
    `INSERT INTO studio_info (id, sales_pin, phones, updated_at)
     VALUES ('main', ?, '[]', NOW())
     ON DUPLICATE KEY UPDATE sales_pin = VALUES(sales_pin), updated_at = NOW()`,
    [pinValue]
  );
  return { ok: true };
}

export async function verifySalesPin(pin) {
  const input = String(pin || "").trim();
  const row = await queryOne(`SELECT sales_pin AS salesPin FROM studio_info WHERE id = 'main' LIMIT 1`);
  const savedPin = String(row?.salesPin || "").trim();
  if (!savedPin) throw createHttpError("매출 비밀번호가 설정되어 있지 않습니다.", 400);
  if (!input || input !== savedPin) throw createHttpError("매출 비밀번호가 올바르지 않습니다.", 403);
  return { ok: true };
}

function normalizeReportRange({ from = "", to = "" } = {}) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromDate = normalizeDate(from) || defaultFrom;
  const toDate = normalizeDate(to) || defaultTo;
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59);
  return {
    from: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} 00:00:00`,
    to: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")} 23:59:59`,
    previousFrom: `${new Date(start.getFullYear(), start.getMonth() - 1, 1).getFullYear()}-${String(new Date(start.getFullYear(), start.getMonth() - 1, 1).getMonth() + 1).padStart(2, "0")}-01 00:00:00`,
    previousTo: `${new Date(start.getFullYear(), start.getMonth(), 0).getFullYear()}-${String(new Date(start.getFullYear(), start.getMonth(), 0).getMonth() + 1).padStart(2, "0")}-${String(new Date(start.getFullYear(), start.getMonth(), 0).getDate()).padStart(2, "0")} 23:59:59`,
  };
}

function normalizePaymentKind(value) {
  const text = String(value || "").trim();
  if (text.includes("환불")) return "refund";
  if (text.includes("업그레이드")) return "upgrade";
  if (text.includes("양도")) return "transfer";
  if (text.includes("재")) return "renewal";
  if (text.includes("체험")) return "trial";
  return "new";
}

function toSafeAmount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listStudioSalesReport({ from = "", to = "", branchId = "" } = {}) {
  const range = normalizeReportRange({ from, to });
  const normalizedBranchId = branchId ? normalizeBranchId(branchId) : "";
  const branchWhere = normalizedBranchId ? " AND sp.branch_id = ? " : "";
  const branchParams = normalizedBranchId ? [normalizedBranchId] : [];

  const paymentRows = await query(
    `SELECT
       spp.id,
       spp.pass_id AS passId,
       spp.user_id AS userId,
       spp.payment_type AS paymentType,
       spp.amount,
       spp.paid_at AS paidAt,
       spp.payment_method AS paymentMethod,
       spp.installment_months AS installmentMonths,
       spp.note,
       sp.branch_id AS branchId,
       ${branchNameExpr("sp")} AS branchName,
       sp.pass_name AS passName,
       sp.pass_type AS passType,
       sp.total_count AS totalCount,
       sp.remaining_count AS remainingCount,
       sp.expires_at AS expiresAt,
       sp.status AS passStatus,
       u.login_id AS loginId,
       u.name,
       u.phone,
       smp.primary_instructor AS instructorName
     FROM studio_pass_payments spp
     JOIN studio_passes sp ON sp.id = spp.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN users u ON u.id = spp.user_id
     LEFT JOIN studio_member_profiles smp ON smp.user_id = spp.user_id
     WHERE COALESCE(spp.paid_at, spp.created_at) BETWEEN ? AND ?
       ${branchWhere}
     ORDER BY COALESCE(spp.paid_at, spp.created_at) DESC, spp.created_at DESC`,
    [range.from, range.to, ...branchParams]
  );

  const previousRows = await query(
    `SELECT spp.amount, spp.payment_type AS paymentType
     FROM studio_pass_payments spp
     JOIN studio_passes sp ON sp.id = spp.pass_id
     WHERE COALESCE(spp.paid_at, spp.created_at) BETWEEN ? AND ?
       ${branchWhere}`,
    [range.previousFrom, range.previousTo, ...branchParams]
  );

  const refundRows = await query(
    `SELECT
       r.id,
       r.pass_id AS passId,
       r.user_id AS userId,
       r.refund_amount AS refundAmount,
       r.reason,
       r.status,
       r.requested_at AS requestedAt,
       r.resolved_at AS resolvedAt,
       sp.branch_id AS branchId,
       ${branchNameExpr("sp")} AS branchName,
       sp.pass_name AS passName,
       u.login_id AS loginId,
       u.name,
       u.phone
     FROM studio_pass_refunds r
     JOIN studio_passes sp ON sp.id = r.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE COALESCE(r.resolved_at, r.requested_at) BETWEEN ? AND ?
       ${branchWhere}
     ORDER BY COALESCE(r.resolved_at, r.requested_at) DESC`,
    [range.from, range.to, ...branchParams]
  ).catch(() => []);

  const classSaleRows = await query(
    `SELECT
       spt.id,
       spt.pass_id AS passId,
       spt.user_id AS userId,
       spt.class_id AS classId,
       spt.delta_count AS deltaCount,
       spt.reason,
       spt.created_at AS createdAt,
       sp.branch_id AS branchId,
       ${branchNameExpr("sp")} AS branchName,
       sp.pass_name AS passName,
       sp.total_count AS totalCount,
       sc.title AS classTitle,
       sc.instructor_name AS instructorName,
       sc.start_at AS classStartAt,
       u.login_id AS loginId,
       u.name,
       u.phone,
       (
         SELECT amount FROM studio_pass_payments spp
         WHERE spp.pass_id = sp.id
         ORDER BY COALESCE(spp.paid_at, spp.created_at) ASC
         LIMIT 1
       ) AS passAmount
     FROM studio_pass_transactions spt
     JOIN studio_passes sp ON sp.id = spt.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     LEFT JOIN studio_classes sc ON sc.id = spt.class_id
     LEFT JOIN users u ON u.id = spt.user_id
     WHERE spt.created_at BETWEEN ? AND ?
       AND spt.delta_count < 0
       ${branchWhere}
     ORDER BY spt.created_at DESC`,
    [range.from, range.to, ...branchParams]
  );

  const expenseRows = await query(
    `SELECT e.id, e.branch_id AS branchId, ${branchNameExpr("e")} AS branchName,
            e.expense_date AS expenseDate, e.category, e.title, e.amount,
            e.payment_method AS paymentMethod, e.installment_months AS installmentMonths,
            e.instructor_name AS instructorName, e.attachment_url AS attachmentUrl,
            e.memo, e.created_by AS createdBy, e.created_at AS createdAt
     FROM studio_expenses e
     LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.expense_date BETWEEN ? AND ?
       ${normalizedBranchId ? " AND e.branch_id = ? " : ""}
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    [range.from, range.to, ...(normalizedBranchId ? [normalizedBranchId] : [])]
  ).catch(() => []);

  const arrearsRows = await query(
    `SELECT sa.id, sa.user_id AS userId, sa.amount, sa.reason, sa.status,
            sa.due_date AS dueDate, sa.created_at AS createdAt, sa.resolved_at AS resolvedAt,
            u.login_id AS loginId, u.name, u.phone,
            sp.branch_id AS branchId,
            ${branchNameExpr("sp")} AS branchName,
            sp.pass_name AS passName
     FROM studio_arrears sa
     LEFT JOIN users u ON u.id = sa.user_id
     LEFT JOIN (
       SELECT user_id, MAX(id) AS pass_id FROM studio_passes
       ${normalizedBranchId ? "WHERE branch_id = ?" : ""}
       GROUP BY user_id
     ) latest ON latest.user_id = sa.user_id
     LEFT JOIN studio_passes sp ON sp.id = latest.pass_id
     LEFT JOIN branches b ON b.id = sp.branch_id
     WHERE sa.status = 'open'
     ORDER BY sa.created_at DESC`,
    normalizedBranchId ? [normalizedBranchId] : []
  );

  const pointRows = await query(
    `SELECT ph.id, ph.user_id AS userId, ph.amount, ph.reason, ph.order_id AS orderId,
            ph.created_at AS createdAt, u.login_id AS loginId, u.name, u.phone
     FROM point_history ph
     LEFT JOIN users u ON u.id = ph.user_id
     WHERE ph.created_at BETWEEN ? AND ?
     ORDER BY ph.created_at DESC`,
    [range.from, range.to]
  ).catch(() => []);

  const staffRows = await query(
    `SELECT id, name, role_code AS roleCode, employment_type AS employmentType,
            phone, app_connection_status AS appConnectionStatus, status,
            salary_type AS salaryType, base_pay AS basePay,
            hourly_wage AS hourlyWage, commission_rate AS commissionRate
     FROM studio_staff_profiles
     WHERE status <> 'archived'
     ORDER BY FIELD(role_code,'owner','manager','instructor'), name ASC`
  ).catch(() => []);

  const sales = (Array.isArray(paymentRows) ? paymentRows : []).map((row) => {
    const user = decryptUserRow({ id: row.userId, loginId: row.loginId, name: row.name, phone: row.phone });
    const kind = normalizePaymentKind(row.paymentType);
    return {
      id: row.id,
      passId: row.passId,
      userId: row.userId,
      userName: user?.name || row.loginId || row.userId,
      userPhone: user?.phone || "",
      branchId: row.branchId || "branch-1",
      branchName: row.branchName || "장덕점",
      paymentType: row.paymentType || "신규결제",
      paymentKind: kind,
      amount: toSafeAmount(row.amount),
      paidAt: row.paidAt,
      paymentMethod: row.paymentMethod || "",
      installmentMonths: row.installmentMonths || "",
      note: row.note || "",
      passName: row.passName || "",
      passType: row.passType || "group",
      totalCount: toCount(row.totalCount),
      remainingCount: toCount(row.remainingCount),
      expiresAt: row.expiresAt,
      instructorName: row.instructorName || "-",
    };
  });

  const refunds = (Array.isArray(refundRows) ? refundRows : []).map((row) => {
    const user = decryptUserRow({ id: row.userId, loginId: row.loginId, name: row.name, phone: row.phone });
    return {
      id: row.id,
      userId: row.userId,
      userName: user?.name || row.loginId || row.userId,
      userPhone: user?.phone || "",
      branchId: row.branchId || "branch-1",
      branchName: row.branchName || "장덕점",
      passName: row.passName || "",
      refundAmount: toSafeAmount(row.refundAmount),
      reason: row.reason || "",
      status: row.status || "requested",
      requestedAt: row.requestedAt,
      resolvedAt: row.resolvedAt,
    };
  });

  const classSales = (Array.isArray(classSaleRows) ? classSaleRows : []).map((row) => {
    const user = decryptUserRow({ id: row.userId, loginId: row.loginId, name: row.name, phone: row.phone });
    const totalCount = Math.max(1, toCount(row.totalCount));
    const amountPerClass = Math.round(toSafeAmount(row.passAmount) / totalCount);
    return {
      id: row.id,
      userId: row.userId,
      userName: user?.name || row.loginId || row.userId,
      userPhone: user?.phone || "",
      branchId: row.branchId || "branch-1",
      branchName: row.branchName || "장덕점",
      passName: row.passName || "",
      classTitle: row.classTitle || row.reason || "수업 이용",
      classStartAt: row.classStartAt,
      instructorName: row.instructorName || "-",
      usedCount: Math.abs(toCount(row.deltaCount)),
      amount: amountPerClass,
      createdAt: row.createdAt,
    };
  });

  const arrears = (Array.isArray(arrearsRows) ? arrearsRows : []).map((row) => ({
    ...row,
    userName: decryptPii(row.name) || row.loginId || row.userId,
    userPhone: decryptPii(row.phone) || "",
    amount: toSafeAmount(row.amount),
    branchId: row.branchId || "branch-1",
    branchName: row.branchName || "장덕점",
  }));

  const expenses = (Array.isArray(expenseRows) ? expenseRows : []).map((row) => ({
    ...row,
    amount: toSafeAmount(row.amount),
    branchId: row.branchId || "branch-1",
    branchName: row.branchName || "장덕점",
  }));

  const points = (Array.isArray(pointRows) ? pointRows : []).map((row) => ({
    ...row,
    userName: decryptPii(row.name) || row.loginId || row.userId,
    userPhone: decryptPii(row.phone) || "",
    amount: toSafeAmount(row.amount),
  }));

  const grossSales = sales.reduce((sum, item) => sum + (item.paymentKind === "refund" ? 0 : item.amount), 0);
  const refundAmount = refunds.reduce((sum, item) => sum + item.refundAmount, 0) + sales.filter((item) => item.paymentKind === "refund").reduce((sum, item) => sum + item.amount, 0);
  const previousGross = (Array.isArray(previousRows) ? previousRows : []).reduce((sum, row) => sum + (normalizePaymentKind(row.paymentType) === "refund" ? 0 : toSafeAmount(row.amount)), 0);
  const expenseAmount = expenses.reduce((sum, item) => sum + item.amount, 0);
  const netSales = grossSales - refundAmount;
  const safeOrderCount = Math.max(1, sales.filter((item) => item.paymentKind !== "refund").length);

  return {
    range,
    summary: {
      grossSales,
      netSales,
      refundAmount,
      refundRate: grossSales > 0 ? Math.round((refundAmount / grossSales) * 1000) / 10 : 0,
      orderCount: sales.filter((item) => item.paymentKind !== "refund").length,
      averageOrderAmount: Math.round(grossSales / safeOrderCount),
      realSales: netSales - expenseAmount,
      expenseAmount,
      arrearsAmount: arrears.reduce((sum, item) => sum + item.amount, 0),
      previousGross,
      monthOverMonthRate: previousGross > 0 ? Math.round(((grossSales - previousGross) / previousGross) * 1000) / 10 : 0,
    },
    sales,
    classSales,
    otherSales: [],
    refunds,
    expenses,
    arrears,
    points,
    staff: (Array.isArray(staffRows) ? staffRows : []).map((row) => ({ ...row, phone: decryptPii(row.phone) || "" })),
  };
}

export async function createStudioExpense(payload, createdBy = "") {
  const title = String(payload?.title || "").trim();
  const amount = Math.max(0, Number(payload?.amount || 0));
  if (!title) throw createHttpError("지출 내역을 입력해 주세요.", 400);
  if (amount <= 0) throw createHttpError("지출 금액을 입력해 주세요.", 400);
  const id = randomUUID();
  const expenseDate = payload?.expenseDate || new Date();
  await query(
    `INSERT INTO studio_expenses
      (id, branch_id, expense_date, category, title, amount, payment_method,
       installment_months, instructor_name, attachment_url, memo, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      normalizeBranchId(payload?.branchId),
      expenseDate,
      String(payload?.category || "기타").trim().slice(0, 80),
      title.slice(0, 200),
      amount,
      String(payload?.paymentMethod || "").trim() || null,
      String(payload?.installmentMonths || "").trim() || null,
      String(payload?.instructorName || "").trim() || null,
      String(payload?.attachmentUrl || "").trim() || null,
      String(payload?.memo || "").trim() || null,
      String(createdBy || "").trim() || null,
    ]
  );
  return queryOne(
    `SELECT id, branch_id AS branchId, expense_date AS expenseDate, category, title, amount,
            payment_method AS paymentMethod, installment_months AS installmentMonths,
            instructor_name AS instructorName, attachment_url AS attachmentUrl, memo,
            created_by AS createdBy, created_at AS createdAt
     FROM studio_expenses WHERE id = ?`,
    [id]
  );
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
  pass_expire:       { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[회원명]]님! [[수강권명]]의 잔여일이 [[수강권 잔여일]]일 남았습니다.",                                param1: 5,    param2: null, skipExpired: false },
  pass_count_expire: { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[회원명]]님! [[수강권명]]의 잔여횟수가 [[수강권 잔여횟수]]회 남았습니다.",                           param1: 5,    param2: null, skipExpired: false },
  pass_pause_expire: { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[회원명]]님! [[수강권명]]의 정지기간이 [[수강권 정지만료일]]일 남았습니다.",                          param1: 3,    param2: null, skipExpired: false },
  class_waitlist:    { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[수업 시작시간]] [[수업명]] [[강사명]] 강사 예약대기 수업이 예약되었습니다.",                         param1: null, param2: null, skipExpired: false },
  class_cancelled:   { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "최소 수강인원 미달로 [[수업 시작시간]] [[수업명]] [[강사명]] 강사 수업이 취소되었습니다.",              param1: null, param2: null, skipExpired: false },
  class_reminder:    { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[수업 시작시간]] [[수업명]] 수업 일정이 있습니다.",                                                   param1: 3,    param2: 3,    skipExpired: false },
  member_birthday:   { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[회원명]]님! 생일을 축하드립니다. 행복한 하루 되세요!",                                               param1: null, param2: null, skipExpired: false },
  locker_expire:     { pushEnabled: true,  smsEnabled: false, kakaoEnabled: false, kakaoTemplateCode: "", message: "[[회원명]]님! [[락커 번호]]번 락커 만료일이 [[락커 종료일]]일 남았습니다.",                             param1: 3,    param2: null, skipExpired: false },
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
        kakaoEnabled: row ? Boolean(row.kakao_enabled) : def.kakaoEnabled,
        kakaoTemplateCode: row ? String(row.kakao_template_code || "") : def.kakaoTemplateCode,
        message:     row ? row.message               : def.message,
        param1:      row ? row.param1                : def.param1,
        param2:      row ? row.param2                : def.param2,
        skipExpired: row ? Boolean(row.skip_expired) : def.skipExpired,
      }];
    })
  );
}

function resolveTemplateFlag(value, current, fieldName) {
  if (value === undefined || value === null) return current;
  if (typeof value !== "boolean") throw createHttpError(`${fieldName} 값은 true 또는 false여야 합니다.`, 400);
  return value;
}

/**
 * 알림 템플릿을 저장합니다.
 * 보내지 않은 항목은 기존 값을 유지하므로, 발송 채널만 끄고 켜도 문구와 조건이 사라지지 않습니다.
 */
export async function saveNotificationTemplate(templateId, patch = {}) {
  if (!NOTIFICATION_DEFAULTS[templateId]) throw createHttpError("알 수 없는 템플릿 ID입니다.", 400);

  const current = (await getNotificationTemplates())[templateId];
  const pushEnabled = resolveTemplateFlag(patch.pushEnabled, current.pushEnabled, "pushEnabled");
  const smsEnabled = resolveTemplateFlag(patch.smsEnabled, current.smsEnabled, "smsEnabled");
  const kakaoEnabled = resolveTemplateFlag(patch.kakaoEnabled, current.kakaoEnabled, "kakaoEnabled");
  const skipExpired = resolveTemplateFlag(patch.skipExpired, current.skipExpired, "skipExpired");
  const kakaoTemplateCode = patch.kakaoTemplateCode === undefined ? current.kakaoTemplateCode : patch.kakaoTemplateCode;
  const message = patch.message === undefined ? current.message : patch.message;
  const param1 = patch.param1 === undefined ? current.param1 : patch.param1;
  const param2 = patch.param2 === undefined ? current.param2 : patch.param2;

  await query(
    `INSERT INTO studio_notification_templates (template_id, push_enabled, sms_enabled, kakao_enabled, kakao_template_code, message, param1, param2, skip_expired, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE push_enabled=VALUES(push_enabled), sms_enabled=VALUES(sms_enabled),
       kakao_enabled=VALUES(kakao_enabled), kakao_template_code=VALUES(kakao_template_code),
       message=VALUES(message), param1=VALUES(param1), param2=VALUES(param2),
       skip_expired=VALUES(skip_expired), updated_at=NOW()`,
    [templateId, pushEnabled ? 1 : 0, smsEnabled ? 1 : 0, kakaoEnabled ? 1 : 0, String(kakaoTemplateCode || "").trim() || null, String(message || ""), param1 ?? null, param2 ?? null, skipExpired ? 1 : 0]
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

export async function cancelCheckIn(checkinId) {
  const normalizedId = String(checkinId || "").trim();
  if (!normalizedId) throw createHttpError("체크인 기록을 선택해 주세요.", 400);

  const existing = await queryOne(
    `SELECT id, status FROM studio_checkins WHERE id = ? LIMIT 1`,
    [normalizedId]
  );
  if (!existing) throw createHttpError("체크인 기록을 찾을 수 없습니다.", 404);
  if (existing.status === "cancelled") return existing;

  await query(
    `UPDATE studio_checkins SET status = 'cancelled' WHERE id = ?`,
    [normalizedId]
  );
  return queryOne(
    `SELECT id, class_id AS classId, user_id AS userId, booking_id AS bookingId,
            status, checked_in_at AS checkedInAt
     FROM studio_checkins WHERE id = ?`,
    [normalizedId]
  );
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
      String(payload?.reason || "").trim() || "미수금 등록",
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

export async function listArrears({ status = "", userId = "" } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("sa.status = ?");
    params.push(String(status).trim());
  }
  if (userId) {
    conditions.push("sa.user_id = ?");
    params.push(String(userId).trim());
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `SELECT sa.id, sa.user_id AS userId, sa.amount, sa.reason, sa.status,
            sa.due_date AS dueDate, sa.created_at AS createdAt,
            sa.resolved_at AS resolvedAt, u.name, u.phone
     FROM studio_arrears sa
     JOIN users u ON u.id = sa.user_id
     ${where}
     ORDER BY CASE WHEN sa.status = 'open' THEN 0 ELSE 1 END,
              sa.created_at DESC`,
    params
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    name: decryptPii(row.name),
    phone: decryptPii(row.phone),
  }));
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
    `SELECT id, user_id AS userId, type, title, message, status,
            scheduled_at AS scheduledAt, sent_at AS sentAt, read_at AS readAt, created_at AS createdAt
     FROM studio_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return Array.isArray(rows) ? rows : [];
}

export async function markNotificationRead({ notificationId, userId }) {
  const result = await query(
    `UPDATE studio_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = ? AND user_id = ?`,
    [String(notificationId || "").trim(), String(userId || "").trim()]
  );
  return { updated: Number(result?.affectedRows || 0) > 0 };
}

export async function markAllNotificationsRead(userId) {
  const result = await query(
    `UPDATE studio_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = ? AND read_at IS NULL`,
    [String(userId || "").trim()]
  );
  return { updatedCount: Number(result?.affectedRows || 0) };
}

export async function listMessageTemplates() {
  const rows = await query(
    `SELECT id, name, channel, title, message, template_code AS templateCode,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_message_templates
     ORDER BY updated_at DESC, created_at DESC`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function createMessageTemplate(payload) {
  const id = randomUUID();
  const name = String(payload?.name || payload?.title || "보관 메시지").trim();
  const message = String(payload?.message || "").trim();
  if (!message) throw createHttpError("보관할 메시지를 입력해 주세요.", 400);
  await query(
    `INSERT INTO studio_message_templates
      (id, name, channel, title, message, template_code, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      name.slice(0, 160),
      String(payload?.channel || "sms").trim().slice(0, 20),
      String(payload?.title || "").trim().slice(0, 160) || null,
      message,
      String(payload?.templateCode || payload?.template_code || "").trim() || null,
      String(payload?.createdBy || payload?.created_by || "").trim() || null,
    ]
  );
  return queryOne(
    `SELECT id, name, channel, title, message, template_code AS templateCode,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_message_templates WHERE id = ?`,
    [id]
  );
}

export async function updateMessageTemplate(templateId, payload) {
  const id = String(templateId || "").trim();
  const message = String(payload?.message || "").trim();
  if (!id) throw createHttpError("수정할 보관함 항목을 찾을 수 없습니다.", 400);
  if (!message) throw createHttpError("보관할 메시지를 입력해 주세요.", 400);
  const result = await query(
    `UPDATE studio_message_templates
     SET name = ?, channel = ?, title = ?, message = ?, template_code = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      String(payload?.name || payload?.title || "보관 메시지").trim().slice(0, 160),
      String(payload?.channel || "sms").trim().slice(0, 20),
      String(payload?.title || "").trim().slice(0, 160) || null,
      message,
      String(payload?.templateCode || payload?.template_code || "").trim() || null,
      id,
    ]
  );
  if (!Number(result?.affectedRows || 0)) throw createHttpError("보관함 항목을 찾을 수 없습니다.", 404);
  return queryOne(
    `SELECT id, name, channel, title, message, template_code AS templateCode,
            created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
     FROM studio_message_templates WHERE id = ?`,
    [id]
  );
}

export async function deleteMessageTemplate(templateId) {
  const result = await query(`DELETE FROM studio_message_templates WHERE id = ?`, [String(templateId || "").trim()]);
  return { deleted: Number(result?.affectedRows || 0) > 0 };
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

/** 로그인 계정과 연결된 재직 직원 프로필을 기준으로 실제 스튜디오 역할을 결정합니다. */
export async function resolveUserStudioRole(user) {
  const userId = String(user?.id || "").trim();
  if (!userId) return "";

  const profile = await queryOne(
    `SELECT role_code AS roleCode, status
     FROM studio_staff_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );
  if (profile) {
    return String(profile.status) === "active"
      ? String(profile.roleCode || "").trim().toLowerCase()
      : "";
  }

  // 기존 데이터 호환용입니다. 새 직원 권한은 studio_staff_profiles.user_id 연결을 사용합니다.
  const legacyRole = String(user?.role || "").trim().toLowerCase();
  if (["owner", "manager", "staff", "instructor", "teacher"].includes(legacyRole)) return legacyRole;
  return "";
}

export async function isRoleAllowed(roleCode, permissionCode) {
  if (!roleCode || !permissionCode) return false;
  const normalizedRole = String(roleCode).trim().toLowerCase();
  if (["owner", "admin", "admin0", "admin1"].includes(normalizedRole)) return true;
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
    "sales.read",
    "staff.read",
    "pass.create",
    "pass.status",
    "pass.issue",
    "pass.detail.write",
    "member.export",
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
      `SELECT id, user_id AS userId, branch_id AS branchId, pass_name AS passName, pass_type AS passType,
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
        (id, user_id, branch_id, pass_name, pass_type, remaining_count, total_count, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        newPassId,
        toUserId,
        normalizeBranchId(sourcePass.branchId),
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
  const request = normalizePassRefundRequest(payload);
  const id = randomUUID();
  return withTransaction(async (conn) => {
    const [passRows] = await conn.execute(
      `SELECT id, status
       FROM studio_passes
       WHERE id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [request.passId, request.userId],
    );
    const pass = passRows?.[0] || null;
    if (!pass) throw createHttpError("본인 소유의 수강권을 찾을 수 없습니다.", 404);
    if (String(pass.status) === "refunded") {
      throw createHttpError("이미 환불 처리된 수강권입니다.", 409);
    }

    const [pendingRows] = await conn.execute(
      `SELECT id
       FROM studio_pass_refunds
       WHERE pass_id = ? AND status = 'requested'
       LIMIT 1
       FOR UPDATE`,
      [request.passId],
    );
    if (pendingRows?.[0]) {
      throw createHttpError("이미 처리 대기 중인 환불 요청이 있습니다.", 409);
    }

    await conn.execute(
      `INSERT INTO studio_pass_refunds
        (id, pass_id, user_id, refund_amount, reason, status, requested_at)
       VALUES (?, ?, ?, ?, ?, 'requested', NOW())`,
      [id, request.passId, request.userId, request.refundAmount, request.reason],
    );
    const [rows] = await conn.execute(`SELECT * FROM studio_pass_refunds WHERE id = ?`, [id]);
    return rows?.[0] || null;
  });
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
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT pass_id AS passId, status
       FROM studio_pass_refunds
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [refundId],
    );
    const row = rows?.[0] || null;
    if (!row) throw createHttpError("환불 요청을 찾을 수 없습니다.", 404);
    if (String(row.status) !== "requested") {
      if (String(row.status) === status) return { ok: true, alreadyResolved: true };
      throw createHttpError("이미 다른 상태로 처리된 환불 요청입니다.", 409);
    }

    await conn.execute(
      `UPDATE studio_pass_refunds
       SET status = ?, resolved_at = NOW()
       WHERE id = ? AND status = 'requested'`,
      [status, refundId]
    );
    if (status === "approved" && row?.passId) {
      await conn.execute(`UPDATE studio_passes SET status = 'refunded', updated_at = NOW() WHERE id = ?`, [row.passId]);
    }
    return { ok: true, alreadyResolved: false };
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

export async function listConsultations({ date = "", staffName = "", type = "", search = "", limit = 500 } = {}) {
  const conditions = [];
  const params = [];
  if (date) { conditions.push("DATE(sc.consult_date) = ?"); params.push(String(date).slice(0, 10)); }
  if (staffName) { conditions.push("sc.staff_name = ?"); params.push(String(staffName)); }
  if (type) { conditions.push("sc.type = ?"); params.push(String(type)); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 500));
  const rows = await query(
    `SELECT id, type, staff_name AS staffName, customer_name AS customerName,
            customer_phone AS customerPhone, consult_date AS consultDate,
            start_time AS startTime, end_time AS endTime, memo,
            user_id AS userId, created_at AS createdAt
     FROM studio_consultations sc ${where}
     ORDER BY sc.consult_date DESC, sc.created_at DESC
     LIMIT ${safeLimit}`,
    params
  );
  let result = Array.isArray(rows) ? rows : [];
  if (search) {
    const kw = String(search).toLowerCase();
    result = result.filter((r) =>
      String(r.customerName || "").toLowerCase().includes(kw) ||
      String(r.customerPhone || "").toLowerCase().includes(kw) ||
      String(r.memo || "").toLowerCase().includes(kw)
    );
  }
  return result;
}

export async function createConsultation({ type, staffName, customerName, customerPhone, consultDate, startTime, endTime, memo, userId } = {}) {
  const id = randomUUID();
  const date = String(consultDate || new Date().toISOString().slice(0, 10));
  await query(
    `INSERT INTO studio_consultations
       (id, type, staff_name, customer_name, customer_phone, consult_date, start_time, end_time, memo, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, type || "전화상담", staffName || "", customerName || "", customerPhone || "", date, startTime || "", endTime || "", memo || "", userId || null]
  );
  return { id, type: type || "전화상담", staffName: staffName || "", customerName: customerName || "", consultDate: date };
}

export async function deleteConsultation(id) {
  await query(`DELETE FROM studio_consultations WHERE id = ?`, [String(id || "")]);
  return { ok: true };
}
