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
