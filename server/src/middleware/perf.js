/**
 * PERF-01: Performance Middleware
 *
 * - Response compression (gzip/br)
 * - ETag support for cache validation
 * - Response time header
 * - API response caching middleware
 */

const { searchCache } = require('../cache');

// ── Response Time Header ───────────────────────────────────────────────────
function responseTime(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ns = process.hrtime.bigint() - start;
    const ms = Number(ns / 1000000n);
    res.setHeader('X-Response-Time', `${ms}ms`);
  });
  next();
}

// ── API Cache Middleware (for GET routes) ───────────────────────────────────
// Use as: router.get('/path', apiCache(60), handler)
function apiCache(ttlSeconds = 300) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = `api:${req.originalUrl}`;
    const cached = searchCache.get(key);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    // Monkey-patch res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        searchCache.set(key, data);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

// ── DB Query Optimizer — adds common Prisma performance patterns ───────────
// Use for pagination: returns optimized skip/take with safety limits
function paginationParams(query, defaults = {}) {
  const maxLimit = defaults.maxLimit || 100;
  const defaultLimit = defaults.limit || 30;
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  const page = Math.max(Number(query.page) || 1, 1);
  return {
    take: limit,
    skip: (page - 1) * limit,
    page,
    limit,
  };
}

// ── Lazy Load Middleware — defer heavy includes to ?expand param ────────────
// Instead of always including relations, only load them when requested
function parseExpand(req, _res, next) {
  const expand = req.query.expand;
  req.expand = expand ? expand.split(',').map(s => s.trim()) : [];
  next();
}

module.exports = { responseTime, apiCache, paginationParams, parseExpand };
