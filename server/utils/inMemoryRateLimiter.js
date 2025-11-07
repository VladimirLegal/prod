const DEFAULT_LIMIT_RESPONSE = { ok: false, error: 'rate_limited' };

function createRateLimiter({ windowMs, max, keyGenerator, responseBody = DEFAULT_LIMIT_RESPONSE }) {
  if (!windowMs || windowMs <= 0) throw new Error('windowMs must be positive');
  if (!max || max <= 0) throw new Error('max must be positive');
  if (typeof keyGenerator !== 'function') throw new Error('keyGenerator must be a function');

  const hits = new Map();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now - entry.windowStart > windowMs) {
        hits.delete(key);
      }
    }
  }, windowMs);
  cleanupInterval.unref?.();

  return function rateLimiter(req, res, next) {
    try {
      const now = Date.now();
      const key = keyGenerator(req);
      const entry = hits.get(key);

      if (!entry || now - entry.windowStart > windowMs) {
        hits.set(key, { windowStart: now, count: 1 });
        return next();
      }

      entry.count += 1;
      if (entry.count > max) {
        return res.status(429).json(responseBody);
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { createRateLimiter };