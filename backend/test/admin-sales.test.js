import test from "node:test";
import assert from "node:assert/strict";

import { buildSalesBuckets, summarizeSalesSeries } from "../src/features/admin/admin.service.js";

test("일별 사용자 지정 구간은 시작일과 종료일을 모두 포함한다", () => {
  const result = buildSalesBuckets("day", "2026-06-01", "2026-06-03");
  assert.equal(result.isCustomRange, true);
  assert.equal(result.buckets.length, 3);
  assert.deepEqual(result.buckets.map((bucket) => bucket.key), ["2026-06-01", "2026-06-02", "2026-06-03"]);
});

test("월별 집계는 현재 연도의 12개월 버킷을 생성한다", () => {
  const result = buildSalesBuckets("month");
  assert.equal(result.buckets.length, 12);
  assert.equal(result.buckets[0].key.endsWith("-01"), true);
  assert.equal(result.buckets[11].key.endsWith("-12"), true);
});

test("매출 요약은 총매출·순매출·환불·평균 객단가를 정확히 계산한다", () => {
  const summary = summarizeSalesSeries([
    { grossRevenue: 100000, netRevenue: 90000, refundRevenue: 10000, orderCount: 2 },
    { grossRevenue: 50000, netRevenue: 50000, refundRevenue: 0, orderCount: 1 },
  ]);
  assert.deepEqual(summary, {
    periodGrossRevenue: 150000,
    periodNetRevenue: 140000,
    periodRefundRevenue: 10000,
    periodOrderCount: 3,
    averageOrderAmount: 50000,
  });
});
