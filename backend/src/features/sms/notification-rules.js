// 알림 발송 워커가 사용하는 순수 판정 규칙입니다. DB나 외부 요청 없이 단독으로 검증할 수 있습니다.
import { createHash } from "node:crypto";

export const MAX_DELIVERY_ATTEMPTS = 3;
// 1차 실패 후 1분, 2차 실패 후 5분. 3차 실패는 재시도하지 않습니다.
// [현재 미사용] 발송 실패 후 다시 시도하기까지의 대기 시간입니다. 이 파일 안에서만 쓰입니다.
export const RETRY_DELAY_MINUTES = [1, 5];

// [현재 미사용] 야간 발송 제한이 시작되는 시각입니다. 이 파일 안에서만 쓰입니다.
export const QUIET_HOURS_START = 21;
// [현재 미사용] 야간 발송 제한이 끝나는 시각입니다. 이 파일 안에서만 쓰입니다.
export const QUIET_HOURS_END = 8;
// [현재 미사용] 야간에 미뤄둔 알림을 다시 보내기 시작하는 시각입니다. 이 파일 안에서만 쓰입니다.
export const QUIET_HOURS_RESUME = 9;
const SEOUL_TIME_ZONE = "Asia/Seoul";

// 예약 확정·수업 취소·수업 임박 알림은 시간이 지나면 의미가 사라지므로 야간에도 즉시 보냅니다.
// [현재 미사용] 야간에도 보내야 하는 긴급 알림 종류입니다. 이 파일 안에서만 쓰입니다.
export const URGENT_TEMPLATE_IDS = new Set(["class_waitlist", "class_cancelled", "class_reminder"]);

const PERMANENT_ERROR_CODES = new Set([
  "UNREGISTERED",
  "NOT_FOUND",
  "INVALID_ARGUMENT",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "SENDER_ID_MISMATCH",
  "THIRD_PARTY_AUTH_ERROR",
]);
const TRANSIENT_ERROR_CODES = new Set([
  "UNAVAILABLE",
  "INTERNAL",
  "RESOURCE_EXHAUSTED",
  "DEADLINE_EXCEEDED",
  "ABORTED",
]);
// 토큰이 더 이상 유효하지 않다는 응답이면 해당 기기 등록을 해제해야 합니다.
const TOKEN_INVALID_CODES = new Set(["UNREGISTERED", "NOT_FOUND", "SENDER_ID_MISMATCH"]);
// 프로젝트 설정·자격증명 문제는 수신자별로 재시도해도 해결되지 않습니다.
const CONFIGURATION_ERROR_CODES = new Set([
  "FCM_NOT_CONFIGURED",
  "FCM_AUTH_FAILED",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "THIRD_PARTY_AUTH_ERROR",
]);

/** 발송 실패 원인을 재시도 가능 여부와 후속 조치 기준으로 분류합니다. */
export function classifySendError(error) {
  const code = String(error?.code || "").toUpperCase();
  const httpStatus = Number(error?.status || 0);

  const configuration = CONFIGURATION_ERROR_CODES.has(code);
  const invalidToken = TOKEN_INVALID_CODES.has(code);

  let retryable;
  if (configuration || invalidToken || PERMANENT_ERROR_CODES.has(code)) {
    retryable = false;
  } else if (TRANSIENT_ERROR_CODES.has(code) || httpStatus === 429 || httpStatus >= 500) {
    retryable = true;
  } else if (httpStatus >= 400 && httpStatus < 500) {
    retryable = false;
  } else {
    // 네트워크 오류나 타임아웃은 HTTP 상태 없이 도착합니다.
    retryable = true;
  }

  return { retryable, invalidToken, configuration, code: code || "UNKNOWN" };
}

/** 다음 재시도 시각을 계산합니다. 더 시도할 수 없으면 null을 돌려줍니다. */
export function resolveNextAttemptAt(attempts, now = new Date()) {
  const attemptNumber = Math.max(1, Number(attempts) || 1);
  if (attemptNumber >= MAX_DELIVERY_ATTEMPTS) return null;
  const minutes = RETRY_DELAY_MINUTES[attemptNumber - 1] ?? RETRY_DELAY_MINUTES[RETRY_DELAY_MINUTES.length - 1];
  return new Date(now.getTime() + minutes * 60_000);
}

function seoulParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

/** 서울 기준 달력 날짜(YYYY-MM-DD)를 돌려줍니다. */
export function seoulDateKey(date = new Date()) {
  const { year, month, day } = seoulParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isQuietHours(date = new Date()) {
  const { hour } = seoulParts(date);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

/**
 * 야간 시간대에 걸린 일반 알림을 다음 허용 시각(서울 09:00)으로 미룹니다.
 * 긴급 템플릿과 관리자의 즉시 발송은 그대로 둡니다.
 */
export function applyQuietHours(scheduledAt, { templateId = "", urgent = false, now = new Date() } = {}) {
  const target = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt || now);
  if (Number.isNaN(target.getTime())) return new Date(now);
  if (urgent || URGENT_TEMPLATE_IDS.has(String(templateId))) return target;
  if (!isQuietHours(target)) return target;

  const { hour } = seoulParts(target);
  // 21시 이후면 다음 날 09시, 자정~08시면 같은 날 09시로 미룹니다.
  const dayOffset = hour >= QUIET_HOURS_START ? 1 : 0;
  const shifted = new Date(target.getTime() + dayOffset * 86_400_000);
  const { year, month, day } = seoulParts(shifted);
  // 서울(UTC+9) 09:00은 UTC 00:00입니다.
  return new Date(Date.UTC(year, month - 1, day, QUIET_HOURS_RESUME - 9, 0, 0, 0));
}

function hashKey(prefix, parts) {
  const digest = createHash("sha1").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex");
  return `${prefix}${digest}`;
}

/**
 * 자동 알림의 중복 방지 키입니다.
 * 템플릿 + 원본 엔티티 + 수신자 + 예정일이 같으면 스케줄러가 반복 실행돼도 한 번만 생성됩니다.
 */
export function buildAutoNotificationId({ templateId, sourceType, sourceId, userId, scheduledFor }) {
  return hashKey("an-", [templateId, sourceType, sourceId, userId, scheduledFor]);
}

/** 알림 한 건과 채널 조합에 대한 발송 레코드 키입니다. */
export function buildDeliveryId({ notificationId, channel, userId }) {
  return hashKey("ad-", [notificationId, channel, userId]);
}

/** 템플릿 문구의 [[변수]] 자리를 실제 값으로 채웁니다. 값이 없으면 빈 문자열로 둡니다. */
export function renderTemplateMessage(message, variables = {}) {
  return String(message || "").replace(/\[\[([^\]]+)\]\]/g, (_, rawName) => {
    const name = String(rawName).trim();
    const value = variables[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** 로그와 DB에 남길 오류 문구에서 토큰·자격증명 흔적을 지우고 길이를 제한합니다. */
export function redactErrorMessage(message, maxLength = 200) {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[redacted key]")
    .replace(/[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{80,}/g, "[redacted token]")
    .replace(/[A-Za-z0-9_-]{100,}/g, "[redacted]")
    .slice(0, maxLength);
}
