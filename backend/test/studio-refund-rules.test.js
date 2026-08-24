import test from "node:test";
import assert from "node:assert/strict";

import { calculatePassRefundAmount, normalizePassRefundRequest } from "../src/features/studio/studio.refund-rules.js";
import { calculateVideoRefundAmount } from "../src/features/academy/academy.refund-rules.js";

test("환불 요청값을 정리한다", () => {
  assert.deepEqual(
    normalizePassRefundRequest({
      userId: " user-1 ",
      passId: " pass-1 ",
      reason: " 일정 변경 ",
      refundAmount: "12000.9",
    }),
    {
      userId: "user-1",
      passId: "pass-1",
      reason: "일정 변경",
      refundAmount: 12000,
    },
  );
});

test("환불 사유가 없으면 거부한다", () => {
  assert.throws(
    () => normalizePassRefundRequest({ userId: "user-1", passId: "pass-1" }),
    /환불 사유/,
  );
});

test("음수 환불 금액은 거부한다", () => {
  assert.throws(
    () => normalizePassRefundRequest({
      userId: "user-1",
      passId: "pass-1",
      reason: "테스트",
      refundAmount: -1,
    }),
    /금액/,
  );
});

test("수강권 환급은 실제 이용분과 위약금 10%를 공제한다", () => {
  // 120만원 1년권을 10회 중 3회 사용한 경우
  const result = calculatePassRefundAmount({ totalAmount: 1200000, totalCount: 10, remainingCount: 7 });

  assert.equal(result.usedAmount, 360000);
  assert.equal(result.penaltyAmount, 120000);
  assert.equal(result.refundAmount, 720000);
  assert.equal(result.basis, "count");
});

test("기간제는 경과 일수 비율로 이용분을 계산한다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 300000, validDays: 30, elapsedDays: 9 });

  assert.equal(result.usedAmount, 90000);
  assert.equal(result.penaltyAmount, 30000);
  assert.equal(result.refundAmount, 180000);
  assert.equal(result.basis, "period");
});

test("위약금은 총액의 10%를 넘지 않는다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 1000000, totalCount: 10, remainingCount: 10 });

  assert.equal(result.penaltyAmount, 100000);
  assert.equal(result.refundAmount, 900000);
});

test("위약금은 남은 금액을 넘어 청구되지 않는다", () => {
  // 거의 다 사용해 잔여 금액이 위약금 상한보다 적은 경우
  const result = calculatePassRefundAmount({ totalAmount: 100000, totalCount: 10, remainingCount: 1 });

  assert.equal(result.usedAmount, 90000);
  assert.equal(result.penaltyAmount, 10000);
  assert.equal(result.refundAmount, 0);
});

test("사업자 귀책 해지는 위약금 없이 미이용분을 전액 환급한다", () => {
  const result = calculatePassRefundAmount({
    totalAmount: 1200000,
    totalCount: 10,
    remainingCount: 7,
    businessFault: true,
  });

  assert.equal(result.penaltyAmount, 0);
  assert.equal(result.refundAmount, 840000);
});

test("사용 이력이 없고 기간 정보도 없으면 위약금만 공제한다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 500000 });

  assert.equal(result.usedAmount, 0);
  assert.equal(result.penaltyAmount, 50000);
  assert.equal(result.refundAmount, 450000);
  assert.equal(result.basis, "none");
});

test("전액 사용한 수강권은 환급액이 0이다", () => {
  const result = calculatePassRefundAmount({ totalAmount: 300000, totalCount: 10, remainingCount: 0 });

  assert.equal(result.refundAmount, 0);
});

test("미리보기를 제공하지 않았으면 시청했어도 전액 환불한다", () => {
  const result = calculateVideoRefundAmount({
    paidAmount: 100000,
    totalChapters: 10,
    watchedChapters: 4,
    previewProvided: false,
  });

  assert.equal(result.refundAmount, 100000);
  assert.equal(result.reason, "preview-not-provided");
});

test("미시청 회차 비율만큼 부분 환불한다", () => {
  const result = calculateVideoRefundAmount({
    paidAmount: 100000,
    totalChapters: 10,
    watchedChapters: 4,
    previewProvided: true,
  });

  assert.equal(result.refundableChapters, 6);
  assert.equal(result.refundAmount, 60000);
  assert.equal(result.reason, "partial");
});

test("한 회차도 보지 않았으면 전액 환불한다", () => {
  const result = calculateVideoRefundAmount({
    paidAmount: 100000,
    totalChapters: 10,
    watchedChapters: 0,
    previewProvided: true,
  });

  assert.equal(result.refundAmount, 100000);
  assert.equal(result.reason, "not-started");
});

test("회차 구분이 없는 강의는 부분 환불을 계산하지 않는다", () => {
  const result = calculateVideoRefundAmount({
    paidAmount: 100000,
    totalChapters: 0,
    watchedChapters: 1,
    previewProvided: true,
  });

  assert.equal(result.refundAmount, 0);
  assert.equal(result.reason, "not-divisible");
});

test("전 회차를 시청했으면 환불액이 0이다", () => {
  const result = calculateVideoRefundAmount({
    paidAmount: 100000,
    totalChapters: 10,
    watchedChapters: 10,
    previewProvided: true,
  });

  assert.equal(result.refundAmount, 0);
});
