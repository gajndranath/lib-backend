import { getRedisClient } from "../config/redis.js";
import logger from "../utils/logger.js";

/**
 * DEDUPLICATION MIDDLEWARE
 * Prevents duplicate requests for the same operation within a time window.
 * Uses the shared Redis client (no separate connection).
 * Falls back to pass-through if Redis is unavailable.
 */

const DEFAULT_DEDUPE_TTL = 2; // 2 seconds — covers accidental double-clicks

export const deduplicationMiddleware = (req, res, next) => {
  // Only apply to write operations
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return next();
  }

  const redis = getRedisClient();

  // If Redis is unavailable, skip deduplication gracefully
  if (!redis) return next();

  const requestFingerprint = generateFingerprint(req);
  const dedupeKey = `dedupe:${requestFingerprint}`;

  redis
    .get(dedupeKey)
    .then((cachedResponse) => {
      if (cachedResponse) {
        // Duplicate request — return cached response
        const cached = JSON.parse(cachedResponse);
        return res
          .status(cached.statusCode || 200)
          .json(
            cached.body ||
              (cached.statusCode >= 400
                ? { success: false, message: "Duplicate request" }
                : { success: true, isDuplicate: true }),
          );
      }

      // Intercept the response to cache it for the TTL window
      const originalJson = res.json.bind(res);

      res.json = function (body) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheTTL = req.body?.deduplicationTTL || DEFAULT_DEDUPE_TTL;
          redis
            .setex(dedupeKey, cacheTTL, JSON.stringify({ statusCode: res.statusCode, body }))
            .catch(() => {}); // Non-critical — fire and forget
        }
        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      logger.warn("Deduplication middleware Redis error — skipping", {
        error: err.message,
        path: req.path,
      });
      next();
    });
};

/**
 * Generate a unique fingerprint for a request.
 * Combines authenticated user ID, HTTP method, path, and body hash.
 */
function generateFingerprint(req) {
  // Prefer authenticated user IDs set by auth middleware
  const userId =
    req.admin?._id?.toString() ||
    req.student?._id?.toString() ||
    "anonymous";

  const endpoint = `${req.method}:${req.path}`;

  // Simple 32-bit hash of the body string
  const bodyString = JSON.stringify(req.body || {});
  let bodyHash = 0;
  for (let i = 0; i < bodyString.length; i++) {
    const char = bodyString.charCodeAt(i);
    bodyHash = (bodyHash << 5) - bodyHash + char;
    bodyHash = bodyHash & bodyHash;
  }

  return `${userId}:${endpoint}:${Math.abs(bodyHash)}`;
}
