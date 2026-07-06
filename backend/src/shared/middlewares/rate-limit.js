function resolveClientKey(req) {
  const forwardedFor = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
  const ip = forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
  return `${ip}:${req.method}:${req.path}`;
}

export function createRateLimiter({ windowMs = 60_000, max = 60, skip, keyGenerator } = {}) {
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

      const now = Date.now();
      if (buckets.size > 10000) cleanup(now);

      const key = typeof keyGenerator === "function" ? keyGenerator(req) : resolveClientKey(req);
      const current = buckets.get(key);
      const bucket =
        current && current.resetAt > now
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: now + windowMs };

      buckets.set(key, bucket);

      const remaining = Math.max(max - bucket.count, 0);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

      if (bucket.count > max) {
        res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
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
