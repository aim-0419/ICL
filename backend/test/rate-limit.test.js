import test from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter } from "../src/shared/middlewares/rate-limit.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("허용 횟수 안에서는 요청을 통과시킨다", () => {
  const limiter = createRateLimiter({ max: 2, now: () => 1000 });
  const req = { ip: "127.0.0.1", requestId: "req-1" };
  const res = createResponse();
  let passed = 0;

  limiter(req, res, () => { passed += 1; });
  limiter(req, res, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(res.headers["RateLimit-Remaining"], "0");
});

test("허용 횟수를 넘으면 429와 재시도 시간을 반환한다", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 10_000, now: () => 1000 });
  const req = { ip: "127.0.0.1", requestId: "req-2" };
  const first = createResponse();
  const second = createResponse();

  limiter(req, first, () => {});
  limiter(req, second, () => assert.fail("제한된 요청은 통과하면 안 됩니다."));

  assert.equal(second.statusCode, 429);
  assert.equal(second.body.code, "RATE_LIMITED");
  assert.equal(second.body.requestId, "req-2");
  assert.equal(second.headers["Retry-After"], "10");
});

test("윈도우 시간이 지나면 호출 횟수를 초기화한다", () => {
  let currentTime = 1000;
  const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => currentTime });
  const req = { ip: "127.0.0.1" };
  let passed = 0;

  limiter(req, createResponse(), () => { passed += 1; });
  currentTime = 2000;
  limiter(req, createResponse(), () => { passed += 1; });

  assert.equal(passed, 2);
});
