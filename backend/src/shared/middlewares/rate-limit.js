/**
 * [요청 횟수 제한]
 *
 * 같은 사람이 짧은 시간에 너무 많이 요청하면 잠시 막습니다.
 * 로그인 비밀번호를 반복해서 찍어 보는 시도나
 * 인증번호 발송을 남발하는 것을 막기 위한 안전장치입니다.
 */
function resolveClientKey(req) {
  const headerGetter = typeof req.get === "function" ? req.get.bind(req) : null;
  const forwardedFor = String(headerGetter?.("x-forwarded-for") || "").split(",")[0].trim();
  const ip = forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
  return `${ip}:${req.method}:${req.path}`;
}

export function createRateLimiter({ windowMs = 60_000, max = 60, skip, keyGenerator, now = Date.now } = {}) {
  const buckets = new Map();

  function cleanup(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimiter(req, res, next) {
    try {
      if (typeof skip === "function" && skip(req)) {
        next();
        return;
      }

      const currentTime = now();
      if (buckets.size > 10000) cleanup(currentTime);

      const key = typeof keyGenerator === "function" ? keyGenerator(req) : resolveClientKey(req);
      const current = buckets.get(key);
      const bucket =
        current && current.resetAt > currentTime
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: currentTime + windowMs };

      buckets.set(key, bucket);

      const remaining = Math.max(max - bucket.count, 0);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

      if (bucket.count > max) {
        res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - currentTime) / 1000)));
        res.status(429).json({
          message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          code: "RATE_LIMITED",
          requestId: req.requestId,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
