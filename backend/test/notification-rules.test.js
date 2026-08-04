import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQuietHours,
  buildAutoNotificationId,
  buildDeliveryId,
  classifySendError,
  isQuietHours,
  MAX_DELIVERY_ATTEMPTS,
  redactErrorMessage,
  renderTemplateMessage,
  resolveNextAttemptAt,
  seoulDateKey,
} from "../src/features/sms/notification-rules.js";

// 서울(UTC+9) 기준 시각을 UTC Date로 만들어 줍니다.
function seoul(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
}

test("일시적인 오류는 재시도 대상으로 분류한다", () => {
  assert.equal(classifySendError({ code: "UNAVAILABLE", status: 503 }).retryable, true);
  assert.equal(classifySendError({ code: "INTERNAL", status: 500 }).retryable, true);
  assert.equal(classifySendError({ code: "QUOTA", status: 429 }).retryable, true);
  assert.equal(classifySendError({ message: "network timeout" }).retryable, true);
});

test("토큰이 무효한 오류는 재시도하지 않고 기기 해제 대상으로 표시한다", () => {
  const unregistered = classifySendError({ code: "UNREGISTERED", status: 404 });
  assert.equal(unregistered.retryable, false);
  assert.equal(unregistered.invalidToken, true);

  const malformed = classifySendError({ code: "INVALID_ARGUMENT", status: 400 });
  assert.equal(malformed.retryable, false);
  assert.equal(malformed.invalidToken, false);
});

test("자격증명·프로젝트 설정 오류는 설정 오류로 분류해 수신자별 재시도를 막는다", () => {
  const authFailed = classifySendError({ code: "FCM_AUTH_FAILED" });
  assert.equal(authFailed.configuration, true);
  assert.equal(authFailed.retryable, false);
  assert.equal(classifySendError({ code: "FCM_NOT_CONFIGURED" }).configuration, true);
});

test("재시도 간격은 1분 → 5분이고 세 번째 시도 이후에는 없다", () => {
  const now = new Date("2026-08-04T03:00:00.000Z");
  assert.equal(resolveNextAttemptAt(1, now).getTime() - now.getTime(), 60_000);
  assert.equal(resolveNextAttemptAt(2, now).getTime() - now.getTime(), 5 * 60_000);
  assert.equal(resolveNextAttemptAt(MAX_DELIVERY_ATTEMPTS, now), null);
});

test("서울 기준 야간 시간대를 판정한다", () => {
  assert.equal(isQuietHours(seoul(2026, 8, 4, 21, 0)), true);
  assert.equal(isQuietHours(seoul(2026, 8, 4, 23, 30)), true);
  assert.equal(isQuietHours(seoul(2026, 8, 4, 3, 0)), true);
  assert.equal(isQuietHours(seoul(2026, 8, 4, 8, 0)), false);
  assert.equal(isQuietHours(seoul(2026, 8, 4, 20, 59)), false);
});

test("야간에 예정된 일반 알림은 다음 허용 시각 09시로 미룬다", () => {
  const lateNight = applyQuietHours(seoul(2026, 8, 4, 22, 10), { templateId: "pass_expire" });
  assert.equal(lateNight.getTime(), seoul(2026, 8, 5, 9, 0).getTime());

  const earlyMorning = applyQuietHours(seoul(2026, 8, 4, 5, 30), { templateId: "member_birthday" });
  assert.equal(earlyMorning.getTime(), seoul(2026, 8, 4, 9, 0).getTime());

  const daytime = seoul(2026, 8, 4, 14, 0);
  assert.equal(applyQuietHours(daytime, { templateId: "pass_expire" }).getTime(), daytime.getTime());
});

test("긴급 템플릿과 관리자 즉시 발송은 야간에도 미루지 않는다", () => {
  const at2210 = seoul(2026, 8, 4, 22, 10);
  assert.equal(applyQuietHours(at2210, { templateId: "class_reminder" }).getTime(), at2210.getTime());
  assert.equal(applyQuietHours(at2210, { templateId: "class_waitlist" }).getTime(), at2210.getTime());
  assert.equal(applyQuietHours(at2210, { templateId: "class_cancelled" }).getTime(), at2210.getTime());
  assert.equal(applyQuietHours(at2210, { templateId: "manual", urgent: true }).getTime(), at2210.getTime());
});

test("중복 방지 키는 원본 엔티티와 예정일까지 반영한다", () => {
  const base = { templateId: "pass_expire", sourceType: "pass", sourceId: "pass-1", userId: "u1", scheduledFor: "2026-08-09" };
  assert.equal(buildAutoNotificationId(base), buildAutoNotificationId({ ...base }));
  assert.notEqual(buildAutoNotificationId(base), buildAutoNotificationId({ ...base, sourceId: "pass-2" }));
  assert.notEqual(buildAutoNotificationId(base), buildAutoNotificationId({ ...base, scheduledFor: "2026-08-10" }));
  assert.notEqual(buildAutoNotificationId(base), buildAutoNotificationId({ ...base, userId: "u2" }));
  assert.ok(buildAutoNotificationId(base).length <= 80);
  assert.ok(buildDeliveryId({ notificationId: "n1", channel: "push", userId: "u1" }).length <= 80);
});

test("템플릿 변수는 값으로 치환되고 값이 없으면 undefined를 남기지 않는다", () => {
  const rendered = renderTemplateMessage("[[회원명]]님! [[수강권명]]의 잔여일이 [[수강권 잔여일]]일 남았습니다.", {
    회원명: "홍길동",
    "수강권명": "그룹 20회권",
    "수강권 잔여일": 5,
  });
  assert.equal(rendered, "홍길동님! 그룹 20회권의 잔여일이 5일 남았습니다.");
  assert.equal(renderTemplateMessage("[[없는값]] 확인", {}), " 확인");
  assert.ok(!renderTemplateMessage("[[없는값]]", {}).includes("undefined"));
});

test("오류 문구에서 토큰과 키 흔적을 지운다", () => {
  const longToken = `${"a".repeat(22)}:${"b".repeat(140)}`;
  const redacted = redactErrorMessage(`token ${longToken} rejected`);
  assert.ok(!redacted.includes(longToken));
  assert.ok(redacted.includes("[redacted"));
  assert.ok(!redactErrorMessage("Authorization: Bearer ya29.abcdefghijklmnop").includes("ya29"));
  assert.ok(redactErrorMessage("x".repeat(500)).length <= 200);
});

test("서울 기준 날짜 키를 만든다", () => {
  assert.equal(seoulDateKey(seoul(2026, 8, 4, 0, 30)), "2026-08-04");
  // UTC로는 전날이지만 서울 기준으로는 당일입니다.
  assert.equal(seoulDateKey(new Date("2026-08-03T16:00:00.000Z")), "2026-08-04");
});
