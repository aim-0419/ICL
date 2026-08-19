import assert from "node:assert/strict";
import test from "node:test";

import { formatCapacityRatio } from "./passDisplay.js";

test("정원이 곧 수강생 수이고 강사는 항상 1명이다", () => {
  assert.equal(formatCapacityRatio(1), "1:1");
  assert.equal(formatCapacityRatio(2), "2:1");
  assert.equal(formatCapacityRatio(6), "6:1");
});

test("문자열로 들어온 정원도 같은 규칙으로 표시한다", () => {
  assert.equal(formatCapacityRatio("2"), "2:1");
  assert.equal(formatCapacityRatio("6"), "6:1");
});

test("소수점이 섞여도 정원은 정수로 끊는다", () => {
  assert.equal(formatCapacityRatio(2.7), "2:1");
});

test("값이 비어 있거나 잘못되면 최소 구성인 1:1로 표시한다", () => {
  for (const value of [undefined, null, "", 0, -3, Number.NaN, "abc"]) {
    assert.equal(formatCapacityRatio(value), "1:1");
  }
});
