import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

/**
 * CACHING MIDDLEWARE
 * Implements aggressive caching for read operations
 * Reduces database load significantly
 */

const CACHE_DURATIONS = {
  // User and static data
  "GET:/api/v1/students/:id": 5 * 60, // 5 minutes
  "GET:/api/v1/admin/:id": 5 * 60,
  "GET:/api/v1/notification": 1 * 60, // 1 minute for notifications (time-sensitive)
  "GET:/api/v1/chat/keys": 60 * 60, // 1 hour for public keys (static)
  "GET:/api/v1/chat/conversations": 2 * 60, // 2 minutes
  "GET:/api/v1/slots": 10 * 60, // 10 minutes for slots
  "GET:/api/v1/announcements": 5 * 60, // 5 minutes
  default: 3 * 60, // 3 minutes default
};

export const cachingMiddleware = (req, res, next) => {
  // Only cache GET requests
  if (req.method !== "GET") {
    return next();
  }

  // Skip caching for certain endpoints
  if (shouldSkipCache(req)) {
    return next();
  }

  const cacheKey = generateCacheKey(req);

  redis
    .get(cacheKey)
    .then((cachedData) => {
      if (cachedData) {
        const data = JSON.parse(cachedData);
        return res.status(200).json({
          ...data,
          _cached: true,
          _cacheKey: cacheKey,
        });
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json to cache the response
      res.json = function (body) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          const cacheTTL = getCacheDuration(req);
          redis.setex(cacheKey, cacheTTL, JSON.stringify(body)).catch((err) => {
            console.error("Cache set error:", err);
          });
        }

        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      console.error("Caching middleware error:", err);
      // Continue if Redis fails
      next();
    });
};

/**
 * Generate cache key based on request
 */
function generateCacheKey(req) {
  const userId = req.user?.id || req.user?._id || "anonymous";
  const queryString = JSON.stringify(req.query || {});
  const path = req.path.replace(/\//g, ":"); // Convert / to : for readability

  return `cache:${userId}:${path}:${simpleHash(queryString)}`;
}

/**
 * Simple hash function for query strings
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Determine cache duration based on endpoint
 */
function getCacheDuration(req) {
  const method = req.method;
  const path = req.path;

  // Check for exact match
  const exactKey = `${method}:${path}`;
  if (CACHE_DURATIONS[exactKey]) {
    return CACHE_DURATIONS[exactKey];
  }

  // Check for pattern match (e.g., GET:/api/v1/students/:id)
  for (const [pattern, duration] of Object.entries(CACHE_DURATIONS)) {
    if (matchesPattern(pattern, exactKey)) {
      return duration;
    }
  }

  return CACHE_DURATIONS.default;
}

/**
 * Simple pattern matching for cache keys
 */
function matchesPattern(pattern, key) {
  const patternParts = pattern.split("/");
  const keyParts = key.split("/");

  if (patternParts.length !== keyParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] !== keyParts[i] && !patternParts[i].startsWith(":")) {
      return false;
    }
  }

  return true;
}

/**
 * Decide if caching should be skipped
 */
function shouldSkipCache(req) {
  const skipPatterns = [
    "/health",
    "/metrics",
    "/admin/analytics", // Real-time analytics should not be cached
    "/chat/messages", // Messages might need fresh data
  ];

  return skipPatterns.some((pattern) => req.path.includes(pattern));
}

/**
 * CACHE INVALIDATION UTILITY
 * Call this when data is updated to invalidate relevant caches
 */
export const invalidateCache = async (pattern) => {
  try {
    const keys = await redis.keys(`cache:*:${pattern}:*`);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(
        `Invalidated ${keys.length} cache entries for pattern: ${pattern}`,
      );
    }
  } catch (err) {
    console.error("Cache invalidation error:", err);
  }
};

/**
 * Invalidate multiple patterns
 */
export const invalidateMultiplePatterns = async (patterns) => {
  for (const pattern of patterns) {
    await invalidateCache(pattern);
  }
};
