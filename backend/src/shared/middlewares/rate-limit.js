// 함수 역할: rate limit 버킷을 나누는 요청자 식별 키를 만듭니다.
//
// X-Forwarded-For 헤더를 직접 읽으면 클라이언트가 값을 임의로 보낼 수 있어,
// 매 요청 다른 IP를 위장하는 것만으로 제한을 우회할 수 있습니다.
// Express 의 req.ip 는 app.set("trust proxy", 1) 설정에 따라 신뢰하는 프록시
// (nginx) 한 단계만 인정하고 그 앞의 값은 무시하므로 위장이 통하지 않습니다.
function resolveClientKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
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
