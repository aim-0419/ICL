import assert from "node:assert/strict";
import test from "node:test";
import {
  isAdminUser,
  resolveSessionToken,
  createAuthMiddlewares,
} from "../src/shared/middlewares/auth.js";

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

const fakeAdmin = { id: "admin-1", role: "admin", userGrade: "admin0", isAdmin: 1 };
const fakeUser  = { id: "user-1",  role: "user",  userGrade: "member",  isAdmin: 0 };

async function stubFindUser(token) {
  if (token === "admin-token") return fakeAdmin;
  if (token === "user-token")  return fakeUser;
  return null;
}

const { requireAuth, requireAdmin } = createAuthMiddlewares(stubFindUser);

function makeReq(token) {
  const cookie = token
    ? `icl_session=${encodeURIComponent(token)}; other=xyz`
    : "other=xyz";
  return { headers: { cookie }, authUser: undefined };
}

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (body) => { res.body = body;       return res; };
  return res;
}

// ─── isAdminUser ─────────────────────────────────────────────────────────────

test("isAdminUser: null/undefined는 false를 반환한다", () => {
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser(undefined), false);
});

test("isAdminUser: admin0 등급은 true를 반환한다", () => {
  assert.equal(isAdminUser({ userGrade: "admin0" }), true);
});

test("isAdminUser: admin1 등급은 true를 반환한다", () => {
  assert.equal(isAdminUser({ userGrade: "admin1" }), true);
});

test("isAdminUser: role이 admin이면 true를 반환한다", () => {
  assert.equal(isAdminUser({ role: "admin", userGrade: "member", isAdmin: 0 }), true);
});

test("isAdminUser: isAdmin 숫자 1이면 true를 반환한다", () => {
  assert.equal(isAdminUser({ role: "user", userGrade: "member", isAdmin: 1 }), true);
});

test("isAdminUser: isAdmin boolean true이면 true를 반환한다", () => {
  assert.equal(isAdminUser({ role: "user", userGrade: "member", isAdmin: true }), true);
});

test("isAdminUser: 일반 회원은 false를 반환한다", () => {
  assert.equal(isAdminUser({ role: "user", userGrade: "member", isAdmin: 0 }), false);
});

// ─── resolveSessionToken ─────────────────────────────────────────────────────

test("resolveSessionToken: 쿠키 헤더가 없으면 빈 문자열을 반환한다", () => {
  assert.equal(resolveSessionToken({ headers: { cookie: "" } }), "");
  assert.equal(resolveSessionToken({ headers: {} }), "");
});

test("resolveSessionToken: 세션 쿠키 값을 URL 디코딩해서 반환한다", () => {
  const token = "abc-123-xyz";
  const req = { headers: { cookie: `icl_session=${encodeURIComponent(token)}; other=x` } };
  assert.equal(resolveSessionToken(req), token);
});

test("resolveSessionToken: 세션 쿠키가 없으면 빈 문자열을 반환한다", () => {
  assert.equal(resolveSessionToken({ headers: { cookie: "theme=dark; lang=ko" } }), "");
});

test("resolveSessionToken: 여러 쿠키 중 세션 쿠키만 정확히 추출한다", () => {
  const req = { headers: { cookie: "a=1; icl_session=mytoken; b=2" } };
  assert.equal(resolveSessionToken(req), "mytoken");
});

// ─── requireAuth ─────────────────────────────────────────────────────────────

test("requireAuth: 토큰 없으면 401을 반환하고 next를 호출하지 않는다", async () => {
  const req = makeReq(null);
  const res = makeRes();
  let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("requireAuth: 유효하지 않은 토큰은 401을 반환한다", async () => {
  const req = makeReq("invalid-token");
  const res = makeRes();
  let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("requireAuth: 유효한 세션은 req.authUser를 설정하고 next를 호출한다", async () => {
  const req = makeReq("user-token");
  const res = makeRes();
  let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.authUser.id, "user-1");
});

test("requireAuth: 관리자 세션도 req.authUser를 설정하고 next를 호출한다", async () => {
  const req = makeReq("admin-token");
  const res = makeRes();
  let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.authUser.id, "admin-1");
});

test("requireAuth: findUser가 예외를 던지면 next(error)를 호출한다", async () => {
  const { requireAuth: authWithError } = createAuthMiddlewares(async () => {
    throw new Error("DB 오류");
  });
  const req = makeReq("some-token");
  const res = makeRes();
  let passedError = null;
  await authWithError(req, res, (err) => { passedError = err; });
  assert.ok(passedError instanceof Error);
  assert.match(passedError.message, /DB 오류/);
});

// ─── requireAdmin ────────────────────────────────────────────────────────────

test("requireAdmin: 토큰 없으면 401을 반환한다", async () => {
  const req = makeReq(null);
  const res = makeRes();
  let called = false;
  await requireAdmin(req, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("requireAdmin: 일반 회원은 403을 반환하고 next를 호출하지 않는다", async () => {
  const req = makeReq("user-token");
  const res = makeRes();
  let called = false;
  await requireAdmin(req, res, () => { called = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test("requireAdmin: 관리자는 req.authUser를 설정하고 next를 호출한다", async () => {
  const req = makeReq("admin-token");
  const res = makeRes();
  let called = false;
  await requireAdmin(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.authUser.id, "admin-1");
});
