import assert from "node:assert/strict";
import test from "node:test";
import {
  isPassCompatibleWithClass,
  normalizeClassInput,
  resolveBookingStatus,
  resolveIssuedPassType,
} from "../src/features/studio/studio.class-rules.js";

test("수업 입력값을 저장 가능한 형태로 정규화한다", () => {
  const result = normalizeClassInput({
    classType: "private",
    title: "  개인 레슨  ",
    instructorName: "",
    startAt: "2026-06-20T10:00:00+09:00",
    endAt: "2026-06-20T10:50:00+09:00",
    capacity: "1",
    minCapacity: "1",
    waitlistCapacity: "",
  });
  assert.equal(result.title, "개인 레슨");
  assert.equal(result.instructorName, "미지정");
  assert.equal(result.capacity, 1);
  assert.equal(result.minCapacity, 1);
  assert.equal(result.waitlistCapacity, null);
});

test("종료 시간이 시작 시간보다 빠르면 거부한다", () => {
  assert.throws(() => normalizeClassInput({
    title: "잘못된 수업",
    startAt: "2026-06-20T11:00:00+09:00",
    endAt: "2026-06-20T10:00:00+09:00",
  }), /시작 및 종료 시간이 올바르지 않습니다/);
});

test("최소 수강 인원이 최대 인원을 넘으면 거부한다", () => {
  assert.throws(() => normalizeClassInput({
    title: "그룹 수업",
    startAt: "2026-06-20T10:00:00+09:00",
    endAt: "2026-06-20T10:50:00+09:00",
    capacity: 4,
    minCapacity: 5,
  }), /최소 수강 인원/);
});

test("정원이 남으면 예약 완료 상태를 반환한다", () => {
  assert.equal(resolveBookingStatus({ reservedCount: 3, capacity: 4, waitlistCount: 0, waitlistCapacity: 2 }), "reserved");
});

test("정원이 차고 대기 여유가 있으면 대기 상태를 반환한다", () => {
  assert.equal(resolveBookingStatus({ reservedCount: 4, capacity: 4, waitlistCount: 1, waitlistCapacity: 2 }), "waitlisted");
});

test("대기 정원도 차면 예약을 거부한다", () => {
  assert.throws(
    () => resolveBookingStatus({ reservedCount: 4, capacity: 4, waitlistCount: 2, waitlistCapacity: 2 }),
    /예약 대기 가능 인원이 마감되었습니다/
  );
});

test("수강권 상품의 수업 형태와 정원으로 발급 타입을 결정한다", () => {
  assert.equal(resolveIssuedPassType({ classType: "group", capacity: 6 }), "group");
  assert.equal(resolveIssuedPassType({ classType: "private", capacity: 1 }), "personal");
  assert.equal(resolveIssuedPassType({ classType: "private", capacity: 2 }), "duet");
});

test("상품 연결 수강권은 같은 수업 형태와 정원에만 사용할 수 있다", () => {
  const pass = { productClassType: "private", productCapacity: 2 };
  assert.equal(isPassCompatibleWithClass(pass, { classType: "private", capacity: 2 }), true);
  assert.equal(isPassCompatibleWithClass(pass, { classType: "private", capacity: 1 }), false);
  assert.equal(isPassCompatibleWithClass(pass, { classType: "group", capacity: 2 }), false);
});

test("기존 수강권도 개인·듀엣·그룹 수업 규칙을 유지한다", () => {
  assert.equal(isPassCompatibleWithClass({ passType: "personal" }, { classType: "private", capacity: 1 }), true);
  assert.equal(isPassCompatibleWithClass({ passType: "duet" }, { classType: "private", capacity: 2 }), true);
  assert.equal(isPassCompatibleWithClass({ passType: "group" }, { classType: "group", capacity: 8 }), true);
  assert.equal(isPassCompatibleWithClass({ passType: "group" }, { classType: "consulting", capacity: 1 }), false);
});
