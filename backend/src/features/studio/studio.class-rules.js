const VALID_CLASS_TYPES = new Set(["private", "group", "consulting", "etc"]);
const VALID_BRANCH_IDS = new Set(["branch-1", "branch-2"]);

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeOptionalCount(value, fallback = null) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : fallback;
}

export function normalizeOptionalDateTime(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeClassInput(payload = {}) {
  const title = String(payload.title || "").trim();
  if (!title) throw validationError("수업명을 입력해 주세요.");

  const startAt = normalizeOptionalDateTime(payload.startAt);
  const endAt = normalizeOptionalDateTime(payload.endAt);
  if (!startAt || !endAt || endAt <= startAt) {
    throw validationError("수업 시작 및 종료 시간이 올바르지 않습니다.");
  }

  const capacity = Math.max(1, normalizeOptionalCount(payload.capacity, 1));
  const minCapacity = normalizeOptionalCount(payload.minCapacity, 0);
  if (minCapacity > capacity) {
    throw validationError("최소 수강 인원은 최대 수강 인원보다 클 수 없습니다.");
  }

  const bookingDeadlineAt = normalizeOptionalDateTime(payload.bookingDeadlineAt);
  const cancellationDeadlineAt = normalizeOptionalDateTime(payload.cancellationDeadlineAt);
  const cancellationDecisionAt = normalizeOptionalDateTime(payload.cancellationDecisionAt);
  for (const [label, deadline] of [
    ["예약 마감", bookingDeadlineAt],
    ["취소 마감", cancellationDeadlineAt],
    ["폐강 판단", cancellationDecisionAt],
  ]) {
    if (deadline && deadline > startAt) {
      throw validationError(`${label} 시간은 수업 시작 시간 이후일 수 없습니다.`);
    }
  }

  return {
    branchId: VALID_BRANCH_IDS.has(String(payload.branchId || "")) ? String(payload.branchId) : "branch-1",
    classType: VALID_CLASS_TYPES.has(payload.classType) ? payload.classType : "group",
    title,
    instructorName: String(payload.instructorName || "").trim() || "미지정",
    roomName: String(payload.roomName || "").trim(),
    startAt,
    endAt,
    capacity,
    minCapacity,
    waitlistCapacity: normalizeOptionalCount(payload.waitlistCapacity, null),
    bookingDeadlineAt,
    cancellationDeadlineAt,
    cancellationDecisionAt,
  };
}

export function resolveBookingStatus({ reservedCount, capacity, waitlistCount, waitlistCapacity }) {
  const safeReservedCount = normalizeOptionalCount(reservedCount, 0);
  const safeCapacity = Math.max(1, normalizeOptionalCount(capacity, 1));
  if (safeReservedCount < safeCapacity) return "reserved";

  const safeWaitlistCapacity = normalizeOptionalCount(waitlistCapacity, null);
  const safeWaitlistCount = normalizeOptionalCount(waitlistCount, 0);
  if (safeWaitlistCapacity !== null && safeWaitlistCount >= safeWaitlistCapacity) {
    throw validationError("예약 대기 가능 인원이 마감되었습니다.");
  }
  return "waitlisted";
}
