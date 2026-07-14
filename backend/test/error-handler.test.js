import assert from "node:assert/strict";
import test from "node:test";
import { errorHandler, notFoundHandler, resolveStatus } from "../src/shared/middlewares/error-handler.js";

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("비정상 status 값은 500으로 정규화한다", () => {
  assert.equal(resolveStatus({ status: 999 }), 500);
  assert.equal(resolveStatus({ status: 409 }), 409);
});

test("404 응답에 요청 추적 번호를 포함한다", () => {
  const res = createResponse();
  notFoundHandler({ requestId: "request-1", originalUrl: "/missing" }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.requestId, "request-1");
  assert.equal(res.body.code, "NOT_FOUND");
});

test("업무 오류는 상태와 메시지를 유지한다", () => {
  const res = createResponse();
  const error = new Error("이미 예약된 수업입니다.");
  error.status = 409;
  error.code = "BOOKING_CONFLICT";
  errorHandler(error, { requestId: "request-2", method: "POST", originalUrl: "/book" }, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    message: "이미 예약된 수업입니다.",
    code: "BOOKING_CONFLICT",
    requestId: "request-2",
  });
});

test("명시적으로 공개한 운영 오류는 안전한 5xx 메시지를 유지한다", () => {
  const res = createResponse();
  const error = new Error("인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  error.status = 503;
  error.code = "EMAIL_DELIVERY_UNAVAILABLE";
  error.expose = true;

  errorHandler(error, { requestId: "request-3", method: "POST", originalUrl: "/verify-email" }, res, () => {});

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: "인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    code: "EMAIL_DELIVERY_UNAVAILABLE",
    requestId: "request-3",
  });
});
