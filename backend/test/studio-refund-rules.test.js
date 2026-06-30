import test from "node:test";
import assert from "node:assert/strict";

import { normalizePassRefundRequest } from "../src/features/studio/studio.refund-rules.js";

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
