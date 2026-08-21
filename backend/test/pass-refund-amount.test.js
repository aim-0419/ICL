// 파일 역할: 수강권 환불 금액을 서버가 계산하도록 바꾼 수정(S-7)의 회귀 테스트입니다.
//
// 이전에는 요청 본문의 refundAmount 를 그대로 저장해, 금액을 위조하면 과다 환불을
// 요구할 수 있었고 화면이 금액을 보내지 않으면 0원으로 기록됐습니다.
// 아래 테스트는 "조작이 막히는가"와 "정상 환불액이 법정 기준대로 나오는가"를 함께 확인합니다.
import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePassRefundAmount,
  normalizePassRefundRequest,
  PASS_CANCELLATION_PENALTY_RATE,
} from "../src/features/studio/studio.refund-rules.js";

// 서비스가 저장하는 값은 항상 calculatePassRefundAmount 의 결과입니다.
// 클라이언트가 어떤 값을 보내든 이 계산 결과가 바뀌지 않아야 합니다.
const PASS = { totalAmount: 1000000, totalCount: 10, remainingCount: 7 };

test("클라이언트가 과다 환불액을 보내도 서버 계산값은 달라지지 않는다", () => {
  const server = calculatePassRefundAmount(PASS);
  assert.equal(server.refundAmount, 600000);

  // 요청 본문 정규화는 통과하더라도(형식상 유효한 숫자),
  for (const tampered of [9999999, 1000000, 750000]) {
    const normalized = normalizePassRefundRequest({
      passId: "pass-1",
      userId: "user-1",
      reason: "조작 시도",
      refundAmount: tampered,
    });
    assert.equal(normalized.refundAmount, tampered);
    // 실제 저장에 쓰이는 계산 결과는 클라이언트 값과 무관해야 합니다.
    assert.equal(calculatePassRefundAmount(PASS).refundAmount, 600000);
    assert.notEqual(calculatePassRefundAmount(PASS).refundAmount, normalized.refundAmount);
  }
});

test("금액을 보내지 않아도 서버가 환불액을 채운다", () => {
  const normalized = normalizePassRefundRequest({
    passId: "pass-1",
    userId: "user-1",
    reason: "금액 미전송",
  });
  assert.equal(normalized.refundAmount, 0, "요청 본문에는 0이 담기지만");
  assert.equal(calculatePassRefundAmount(PASS).refundAmount, 600000, "저장값은 서버 계산으로 채워져야 합니다");
});

test("횟수제: 사용분을 뺀 뒤 위약금 10%를 적용한다", () => {
  const result = calculatePassRefundAmount(PASS);
  assert.equal(result.usedAmount, 300000, "10회 중 3회 사용");
  assert.equal(result.penaltyAmount, 100000, "총액의 10%");
  assert.equal(result.refundAmount, 600000);
  assert.equal(result.basis, "count");
});

test("한 번도 쓰지 않았으면 위약금만 빠진다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 1000000, totalCount: 10, remainingCount: 10 });
  assert.equal(result.usedAmount, 0);
  assert.equal(result.refundAmount, 900000);
});

test("기간제: 경과일수 비율로 사용분을 계산한다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 300000, validDays: 30, elapsedDays: 9 });
  assert.equal(result.basis, "period");
  assert.equal(result.usedAmount, 90000);
  assert.equal(result.refundAmount, 180000, "300000 - 90000 - 30000");
});

test("위약금은 총액의 10%를 넘지 않는다", () => {
  const total = 1000000;
  for (const remaining of [10, 7, 5, 1]) {
    const result = calculatePassRefundAmount({ totalAmount: total, totalCount: 10, remainingCount: remaining });
    assert.ok(
      result.penaltyAmount <= Math.floor(total * PASS_CANCELLATION_PENALTY_RATE),
      `위약금 상한 초과: ${result.penaltyAmount}`,
    );
  }
});

test("거의 다 쓴 수강권은 남은 금액을 넘겨 청구하지 않는다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 100000, totalCount: 10, remainingCount: 1 });
  assert.ok(result.refundAmount >= 0, "환불액이 음수가 되면 안 됩니다");
  assert.ok(result.penaltyAmount <= 100000 - result.usedAmount, "잔액을 넘는 위약금 금지");
});

test("사업자 귀책이면 위약금을 물리지 않는다", () => {
  const result = calculatePassRefundAmount({ ...PASS, businessFault: true });
  assert.equal(result.penaltyAmount, 0);
  assert.equal(result.refundAmount, 700000);
});

test("결제 기록이 없으면 0원으로 처리한다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 0, totalCount: 10, remainingCount: 5 });
  assert.equal(result.refundAmount, 0);
  assert.equal(result.basis, "none");
});

test("환불 사유는 여전히 필수다", () => {
  assert.throws(
    () => normalizePassRefundRequest({ passId: "pass-1", userId: "user-1" }),
    /환불 사유/,
  );
});
