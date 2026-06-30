function resolveStatus(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function resolveErrorCode(error, status) {
  const code = String(error?.code || "").trim();
  if (code && /^[A-Z0-9_]{2,80}$/.test(code)) return code;
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "INTERNAL_SERVER_ERROR";
  return "REQUEST_FAILED";
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    message: "요청한 API 경로를 찾을 수 없습니다.",
    code: "NOT_FOUND",
    requestId: req.requestId || "",
    path: req.originalUrl,
  });
}

/** 내부 오류는 서버 로그에 남기고 운영 응답에는 민감한 상세 내용을 노출하지 않습니다. */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = resolveStatus(error);
  const code = resolveErrorCode(error, status);
  const requestId = req.requestId || "";
  const isInternal = status >= 500;
  const message = isInternal && process.env.NODE_ENV === "production"
    ? "서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    : String(error?.message || "서버 처리 중 오류가 발생했습니다.");

  if (isInternal) {
    console.error("[api-error]", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      code,
      message: String(error?.message || ""),
      stack: process.env.NODE_ENV === "production" ? undefined : error?.stack,
    });
  }

  res.status(status).json({ message, code, requestId });
}

export { resolveStatus };
