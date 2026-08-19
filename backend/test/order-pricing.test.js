import test from "node:test";
import assert from "node:assert/strict";

import {
  clampDiscount,
  computeServerOrderTotal,
  sumListPrice,
} from "../src/features/orders/order-pricing.js";

function priceMap(entries) {
  const m = new Map(entries);
  return (id) => (m.has(String(id)) ? m.get(String(id)) : null);
}

test("정가 합계는 단가와 수량을 곱해 더한다", () => {
  const q = new Map([["v1", 2], ["v2", 1]]);
  const { listTotal, unresolved } = sumListPrice(q, priceMap([["v1", 25000], ["v2", 40000]]));
  assert.equal(listTotal, 90000);
  assert.deepEqual(unresolved, []);
});

test("가격을 못 찾은 상품은 unresolved 로 모은다", () => {
  const q = new Map([["v1", 1], ["ghost", 1]]);
  const { listTotal, unresolved } = sumListPrice(q, priceMap([["v1", 25000]]));
  assert.equal(listTotal, 25000);
  assert.deepEqual(unresolved, ["ghost"]);
});

test("포인트 할인은 보유 잔액을 넘지 못한다", () => {
  assert.equal(clampDiscount(60000, 100000), 60000);
  assert.equal(clampDiscount(60000, 10000), 10000);
  assert.equal(clampDiscount(-5, 100000), 0);
});

test("정상 결제: 정가와 실결제가 같으면 통과", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 25000]]),
    paidAmount: 25000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.expectedAmount, 25000);
});

test("금액 조작: 125만원 상품을 100원에 결제하면 거부", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["pass-vvip", 1]]),
    priceOf: priceMap([["pass-vvip", 1250000]]),
    paidAmount: 100,
  });
  assert.equal(r.ok, false);
  assert.equal(r.expectedAmount, 1250000);
});

test("정상 포인트 할인: 잔액 충분하면 할인 반영해 통과", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 100000]]),
    discountPoint: 60000,
    pointBalance: 60000,
    paidAmount: 40000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.allowedDiscount, 60000);
  assert.equal(r.expectedAmount, 40000);
});

test("유령 포인트: 잔액 없는데 할인 크게 넣으면 거부", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 100000]]),
    discountPoint: 100000,
    pointBalance: 0,
    paidAmount: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.allowedDiscount, 0);
  assert.equal(r.expectedAmount, 100000);
});

test("가격 미해소 상품이 섞이면 금액이 맞아도 거부", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["ghost", 1]]),
    priceOf: priceMap([]),
    paidAmount: 0,
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.unresolved, ["ghost"]);
});

test("스튜디오 수강권도 같은 규칙으로 검증한다 (가격원 무관)", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["pass-10", 1]]),
    priceOf: priceMap([["pass-10", 300000]]),
    paidAmount: 300000,
  });
  assert.equal(r.ok, true);
});

test("차감액은 검증 통과 시 적용 할인액과 같다", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 100000]]),
    discountPoint: 30000,
    pointBalance: 50000,
    paidAmount: 70000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.allowedDiscount, 30000); // 차감할 금액
});

test("포인트 미사용 주문은 차감액이 0이다", () => {
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 100000]]),
    discountPoint: 0,
    pointBalance: 50000,
    paidAmount: 100000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.allowedDiscount, 0); // 차감 없음
});

test("잔액을 초과해 할인을 적용한 결제는 거부된다", () => {
  // 잔액 10000인데 30000 할인받아 70000만 결제한 경우
  const r = computeServerOrderTotal({
    quantities: new Map([["v1", 1]]),
    priceOf: priceMap([["v1", 100000]]),
    discountPoint: 30000,
    pointBalance: 10000,
    paidAmount: 70000,
  });
  assert.equal(r.ok, false); // 거부
  assert.equal(r.allowedDiscount, 10000);
  assert.equal(r.expectedAmount, 90000); // 90000 냈어야 함
});
