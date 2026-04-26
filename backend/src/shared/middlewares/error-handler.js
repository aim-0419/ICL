// 파일 역할: 존재하지 않는 API와 서버 에러를 공통 JSON 응답으로 정리합니다.
// 함수 역할: 매칭되는 라우트가 없을 때 404 JSON 응답을 반환합니다.
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
}

// 함수 역할: 컨트롤러나 서비스에서 전달된 에러를 HTTP 상태 코드와 메시지로 변환합니다.
export function errorHandler(error, req, res, next) {
  const status = error.status ?? 500;
  res.status(status).json({
    message: error.message ?? "Internal server error",
  });
}
