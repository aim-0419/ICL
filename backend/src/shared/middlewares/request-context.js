import { randomUUID } from "node:crypto";

/** API 요청마다 추적 번호를 부여해 브라우저 오류와 서버 로그를 연결합니다. */
export function requestContext(req, res, next) {
  const incomingId = String(req.headers["x-request-id"] || "").trim();
  const requestId = incomingId && incomingId.length <= 100 ? incomingId : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
