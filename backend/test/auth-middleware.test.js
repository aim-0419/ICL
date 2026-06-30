import test from "node:test";
import assert from "node:assert/strict";

import {
  createAuthMiddlewares,
  isAdminUser,
  resolveSessionToken,
} from "../src/shared/middlewares/auth.js";
import { SESSION_COOKIE_NAME } from "../src/shared/constants.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("세션 쿠키에서 토큰을 안전하게 읽는다", () => {
  const req = { headers: { cookie: `theme=light; ${SESSION_COOKIE_NAME}=token%20123` } };
  assert.equal(resolveSessionToken(req), "token 123");
});

test("일반 회원은 관리자 미들웨어를 통과할 수 없다", async () => {
  const { requireAdmin } = createAuthMiddlewares(async () => ({ id: "user-1", role: "user" }));
  const req = { headers: { cookie: `${SESSION_COOKIE_NAME}=session-token` } };
  const res = createResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("관리자는 인증 사용자 정보와 함께 관리자 미들웨어를 통과한다", async () => {
  const user = { id: "admin-1", userGrade: "admin0" };
  const { requireAdmin } = createAuthMiddlewares(async () => user);
  const req = { headers: { cookie: `${SESSION_COOKIE_NAME}=session-token` } };
  const res = createResponse();
  let nextCalled = false;

  await requireAdmin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.authUser, user);
});

test("관리자 판별은 허용된 등급과 역할만 인정한다", () => {
  assert.equal(isAdminUser({ userGrade: "admin1" }), true);
  assert.equal(isAdminUser({ role: "admin" }), true);
  assert.equal(isAdminUser({ role: "manager" }), false);
  assert.equal(isAdminUser({ role: "user", isAdmin: 0 }), false);
});
