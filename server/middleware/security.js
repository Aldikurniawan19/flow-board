const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Require custom X-Requested-With header on cookie-authenticated state-changing requests
 * to mitigate CSRF. External Bearer/public AI endpoints manage their own auth & rate limits.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireCsrfHeader(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }
  const path = req.path || '';
  if (
    path === '/mcp' ||
    path.startsWith('/mcp/') ||
    path.startsWith('/v1/') ||
    path.startsWith('/public/')
  ) {
    return next();
  }
  const headerVal = req.get('X-Requested-With');
  if (headerVal !== 'FlowBoard') {
    return res.status(403).json({
      error: 'Permintaan ditolak karena header keamanan tidak valid.',
    });
  }
  return next();
}

/**
 * Apply permissive CORS headers exclusively for external AI/MCP/public endpoints
 * (which never rely on browser cookies).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function applyExternalApiCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
}

/**
 * Apply baseline HTTP security headers.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function applySecurityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next();
}

/**
 * Simple in-memory fixed-window rate limiter for auth endpoints.
 * @param {{ windowMs: number, max: number, enabled?: boolean }} options
 */
export function createRateLimiter({ windowMs, max, enabled = true }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    if (!enabled) return next();

    const key = req.ip || 'unknown';
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existing.count >= max) {
      return res.status(429).json({
        error: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
      });
    }

    existing.count += 1;
    return next();
  };
}
