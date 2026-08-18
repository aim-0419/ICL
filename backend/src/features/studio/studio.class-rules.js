const VALID_CLASS_TYPES = new Set(["private", "group", "consulting", "etc"]);
const VALID_BRANCH_IDS = new Set(["branch-1", "branch-2"]);
const VALID_ISSUED_PASS_TYPES = new Set(["personal", "duet", "group"]);

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
    if (required) throw createRuleError(`${fieldName}을 입력해 주세요.`);
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
    throw createRuleError("시작 및 종료 시간이 올바르지 않습니다.");
  }

  const classType = VALID_CLASS_TYPES.has(String(payload.classType || "").trim())
    ? String(payload.classType).trim()
    : "group";
  const title = toCleanText(payload.title, 160);
  if (!title) throw createRuleError("수업명을 입력해 주세요.");

  const capacity = normalizeOptionalCount(payload.capacity, classType === "private" ? 1 : 6, { min: 1, max: 100 });
  const minCapacity = normalizeOptionalCount(payload.minCapacity ?? payload.min_capacity, 0, { min: 0, max: 100 });
  if (minCapacity > capacity) {
    throw createRuleError("최소 수강 인원은 최대 정원보다 클 수 없습니다.");
  }

  const rawWaitlistCapacity = payload.waitlistCapacity ?? payload.waitlist_capacity;
  const waitlistCapacity =
    rawWaitlistCapacity == null || rawWaitlistCapacity === ""
      ? null
      : normalizeOptionalCount(rawWaitlistCapacity, 0, { min: 0, max: 100 });

  const branchId = VALID_BRANCH_IDS.has(String(payload.branchId || payload.branch_id || "").trim())
    ? String(payload.branchId || payload.branch_id).trim()
    : "branch-1";

  return {
    branchId,
    classType,
    title,
    instructorName: toCleanText(payload.instructorName ?? payload.instructor_name, 120) || "미지정",
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

  throw createRuleError("예약 대기 가능 인원이 마감되었습니다.", 409);
}

export function resolveIssuedPassType({ passType = "", classType = "", capacity = 0 } = {}) {
  const normalizedPassType = String(passType || "").trim().toLowerCase();
  if (VALID_ISSUED_PASS_TYPES.has(normalizedPassType)) return normalizedPassType;

  const normalizedClassType = String(classType || "").trim().toLowerCase();
  if (normalizedClassType === "group") return "group";
  if (normalizedClassType === "private") {
    return normalizeOptionalCount(capacity, 1, { min: 1, max: 100 }) === 2 ? "duet" : "personal";
  }
  return "group";
}

export function isPassCompatibleWithClass(pass = {}, classInfo = {}) {
  const classType = String(classInfo.classType || classInfo.class_type || "").trim().toLowerCase();
  const classCapacity = normalizeOptionalCount(classInfo.capacity, 0, { min: 0, max: 100 });
  if (!VALID_CLASS_TYPES.has(classType) || !["private", "group"].includes(classType)) return false;

  const productClassType = String(pass.productClassType || pass.product_class_type || "").trim().toLowerCase();
  if (productClassType) {
    const productCapacity = normalizeOptionalCount(
      pass.productCapacity ?? pass.product_capacity,
      0,
      { min: 0, max: 100 },
    );
    return productClassType === classType && productCapacity > 0 && productCapacity === classCapacity;
  }

  const passType = resolveIssuedPassType({ passType: pass.passType ?? pass.pass_type });
  if (passType === "group") return classType === "group";
  if (passType === "personal") return classType === "private" && classCapacity === 1;
  return classType === "private" && classCapacity === 2;
}
