function defaultKeyGenerator(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

/**
 * 한 서버 프로세스 안에서 짧은 시간의 과도한 API 호출을 차단합니다.
 * 로그인·회원가입처럼 영구 기록이 필요한 제한은 기존 DB 기반 제한을 계속 사용합니다.
 */
export function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyGenerator = defaultKeyGenerator,
  skip = () => false,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();
  let requestCount = 0;

  return function rateLimiter(req, res, next) {
    if (skip(req)) {
      next();
      return;
    }

    const currentTime = now();
    const key = String(keyGenerator(req) || "unknown");
    const previous = buckets.get(key);
    const bucket = !previous || currentTime >= previous.resetAt
      ? { count: 0, resetAt: currentTime + windowMs }
      : previous;
    bucket.count += 1;
    buckets.set(key, bucket);

    requestCount += 1;
    if (requestCount % 500 === 0) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (currentTime >= value.resetAt) buckets.delete(bucketKey);
      }
    }

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        code: "RATE_LIMITED",
        requestId: req.requestId || "",
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
