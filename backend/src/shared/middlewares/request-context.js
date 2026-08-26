/**
 * [요청 추적 정보]
 *
 * 들어온 요청마다 고유 번호를 붙여 둡니다.
 * 문제가 생겼을 때 어떤 요청에서 무슨 일이 있었는지 기록을 따라가기 쉬워집니다.
 */
import { randomUUID } from "node:crypto";

function normalizeIncomingRequestId(value) {
  const requestId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return "";
  return requestId;
}

export function requestContext(req, res, next) {
  const incomingRequestId = normalizeIncomingRequestId(req.get("x-request-id"));
  req.requestId = incomingRequestId || randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
