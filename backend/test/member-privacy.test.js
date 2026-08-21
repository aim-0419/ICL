// 파일 역할: 강사 권한에 회원 개인정보가 과다 노출되던 문제(S-5) 수정의 회귀 테스트입니다.
//
// 마스킹은 반드시 서버에서 일어나야 하고, 운영 책임자(owner·manager·관리자)의
// 응답은 이전과 같아야 합니다. 아래 테스트는 두 방향을 함께 확인합니다.
import test from "node:test";
import assert from "node:assert/strict";

import {
  canViewMemberPii,
  maskEmail,
  maskMemberRow,
  maskMemberRows,
  maskPhone,
} from "../src/shared/security/member-privacy.js";

const MEMBER = {
  id: "user-1",
  name: "김회원",
  gender: "female",
  email: "member@example.com",
  phone: "010-1234-5678",
  address: "광주광역시 광산구 풍영로 189",
  addressDetail: "3층",
  birthDate: "1990-05-01",
  passName: "그룹 10회권",
  remainingCount: 7,
};

test("전화번호는 앞 3자리와 뒤 4자리만 남는다", () => {
  assert.equal(maskPhone("010-1234-5678"), "010-****-5678");
  assert.equal(maskPhone("01012345678"), "010-****-5678");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone("123"), "***", "형식이 짧으면 전부 가린다");
});

test("이메일은 아이디 앞 두 글자만 남는다", () => {
  assert.equal(maskEmail("member@example.com"), "me***@example.com");
  assert.equal(maskEmail("ab@x.com"), "ab***@x.com");
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail("not-an-email"), "***");
});

test("강사에게는 주소·생년월일이 비워지고 연락처가 가려진다", () => {
  const masked = maskMemberRow(MEMBER);

  assert.equal(masked.address, "");
  assert.equal(masked.addressDetail, "");
  assert.equal(masked.birthDate, "");
  assert.equal(masked.phone, "010-****-5678");
  assert.equal(masked.email, "me***@example.com");
});

test("이름·성별과 수업 운영에 필요한 값은 그대로 남는다", () => {
  const masked = maskMemberRow(MEMBER);

  assert.equal(masked.name, "김회원");
  assert.equal(masked.gender, "female");
  assert.equal(masked.passName, "그룹 10회권");
  assert.equal(masked.remainingCount, 7);
});

test("응답 키 구조가 유지되어 화면 수정이 필요 없다", () => {
  const masked = maskMemberRow(MEMBER);
  assert.deepEqual(Object.keys(masked).sort(), Object.keys(MEMBER).sort());
});

test("원본 객체를 바꾸지 않는다", () => {
  const copy = { ...MEMBER };
  maskMemberRow(MEMBER);
  assert.deepEqual(MEMBER, copy);
});

test("목록 전체에 적용된다", () => {
  const rows = maskMemberRows([MEMBER, { ...MEMBER, id: "user-2" }]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.address, "");
    assert.equal(row.phone, "010-****-5678");
  }
});

test("값이 없는 필드는 건드리지 않는다", () => {
  const masked = maskMemberRow({ name: "홍길동", phone: "", email: null, address: "" });
  assert.equal(masked.phone, "");
  assert.equal(masked.email, null);
});

// ── 권한 판정 ────────────────────────────────────────────────────────────────

test("관리자는 원문을 볼 수 있다", async () => {
  assert.equal(await canViewMemberPii({ id: "a", isAdmin: true }, async () => ""), true);
  assert.equal(await canViewMemberPii({ id: "a", role: "admin" }, async () => ""), true);
});

test("owner·manager 는 원문을 볼 수 있다", async () => {
  assert.equal(await canViewMemberPii({ id: "b" }, async () => "owner"), true);
  assert.equal(await canViewMemberPii({ id: "c" }, async () => "manager"), true);
});

test("강사는 원문을 볼 수 없다", async () => {
  assert.equal(await canViewMemberPii({ id: "d" }, async () => "instructor"), false);
  assert.equal(await canViewMemberPii({ id: "e" }, async () => "teacher"), false);
});

test("역할이 없으면 원문을 볼 수 없다", async () => {
  assert.equal(await canViewMemberPii({ id: "f" }, async () => ""), false);
  assert.equal(await canViewMemberPii({ id: "g" }, undefined), false);
});
