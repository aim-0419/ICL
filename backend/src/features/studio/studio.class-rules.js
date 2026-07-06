const VALID_CLASS_TYPES = new Set(["private", "group", "consulting", "etc"]);
const VALID_BRANCH_IDS = new Set(["branch-1", "branch-2"]);

function createRuleError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toCleanText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function toDateTime(value, fieldName, { required = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw createRuleError(`${fieldName}을(를) 입력해 주세요.`);
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    throw createRuleError(`${fieldName} 형식이 올바르지 않습니다.`);
  }
  return date;
}

export function normalizeOptionalCount(value, fallback = 0, { min = 0, max = 200 } = {}) {
  if (value == null || value === "") return fallback;
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return fallback;
  return Math.max(min, Math.min(max, count));
}

export function normalizeClassInput(payload = {}) {
  const startAt = toDateTime(payload.startAt ?? payload.start_at, "수업 시작 시간");
  const endAt = toDateTime(payload.endAt ?? payload.end_at, "수업 종료 시간");
  if (endAt.getTime() <= startAt.getTime()) {
    throw createRuleError("수업 종료 시간은 시작 시간보다 늦어야 합니다.");
  }

  const classType = VALID_CLASS_TYPES.has(String(payload.classType || "").trim())
    ? String(payload.classType).trim()
    : "group";
  const title = toCleanText(payload.title, 160);
  if (!title) throw createRuleError("수업명을 입력해 주세요.");

  const capacity = normalizeOptionalCount(payload.capacity, classType === "private" ? 1 : 6, { min: 1, max: 100 });
  const minCapacity = Math.min(
    capacity,
    normalizeOptionalCount(payload.minCapacity ?? payload.min_capacity, 0, { min: 0, max: 100 }),
  );
  const waitlistCapacity = normalizeOptionalCount(
    payload.waitlistCapacity ?? payload.waitlist_capacity,
    0,
    { min: 0, max: 100 },
  );

  const branchId = VALID_BRANCH_IDS.has(String(payload.branchId || payload.branch_id || "").trim())
    ? String(payload.branchId || payload.branch_id).trim()
    : "branch-1";

  return {
    branchId,
    classType,
    title,
    instructorName: toCleanText(payload.instructorName ?? payload.instructor_name, 120),
    roomName: toCleanText(payload.roomName ?? payload.room_name, 120),
    startAt,
    endAt,
    capacity,
    minCapacity,
    waitlistCapacity,
    bookingDeadlineAt: toDateTime(payload.bookingDeadlineAt ?? payload.booking_deadline_at, "예약 마감 시간", { required: false }),
    cancellationDeadlineAt: toDateTime(payload.cancellationDeadlineAt ?? payload.cancellation_deadline_at, "취소 마감 시간", { required: false }),
    cancellationDecisionAt: toDateTime(payload.cancellationDecisionAt ?? payload.cancellation_decision_at, "폐강 결정 시간", { required: false }),
  };
}

export function resolveBookingStatus({ reservedCount = 0, capacity = 0, waitlistCount = 0, waitlistCapacity = 0 } = {}) {
  const reserved = normalizeOptionalCount(reservedCount, 0, { min: 0, max: 100000 });
  const cap = normalizeOptionalCount(capacity, 0, { min: 0, max: 100000 });
  if (reserved < cap) return "reserved";

  const waitlisted = normalizeOptionalCount(waitlistCount, 0, { min: 0, max: 100000 });
  const waitCap = normalizeOptionalCount(waitlistCapacity, 0, { min: 0, max: 100000 });
  if (waitlisted < waitCap) return "waitlisted";

  throw createRuleError("예약 가능한 자리와 대기 정원이 모두 마감되었습니다.", 409);
}
