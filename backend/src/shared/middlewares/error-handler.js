export function notFoundHandler(req, res, next) {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
}

export function errorHandler(error, req, res, next) {
  const status = error.status ?? 500;
  res.status(status).json({
    message: error.message ?? "Internal server error",
  });
}
