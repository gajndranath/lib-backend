import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

/**
 * DEDUPLICATION MIDDLEWARE
 * Prevents duplicate requests for the same operation within a time window
 * Useful for preventing double submissions and reducing server load
 */

const DEFAULT_DEDUPE_TTL = 2; // 2 seconds for accidental double-clicks

export const deduplicationMiddleware = (req, res, next) => {
  // Only apply to write operations
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return next();
  }

  // Generate a unique request fingerprint
  const requestFingerprint = generateFingerprint(req);
  const dedupeKey = `dedupe:${requestFingerprint}`;

  redis
    .get(dedupeKey)
    .then((cachedResponse) => {
      if (cachedResponse) {
        // Request is a duplicate
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

      // Store original response methods
      const originalJson = res.json.bind(res);

      // Override json method to cache successful responses
      res.json = function (body) {
        // Only cache successful responses for write operations
        if (res.statusCode < 300 && res.statusCode >= 200) {
          const cacheTTL = req.body?.deduplicationTTL || DEFAULT_DEDUPE_TTL;
          redis.setex(dedupeKey, cacheTTL, JSON.stringify({ body }));
        }

        return originalJson(body);
      };

      next();
    })
    .catch((err) => {
      console.error("Deduplication middleware error:", err);
      // Continue if Redis fails
      next();
    });
};

/**
 * Generate a unique fingerprint for a request
 * Combines user ID, endpoint, and request body hash
 */
function generateFingerprint(req) {
  const userId = req.user?.id || req.user?._id || "anonymous";
  const endpoint = `${req.method}:${req.path}`;

  // Create a simple hash of the body
  let bodyHash = 0;
  const bodyString = JSON.stringify(req.body || {});

  for (let i = 0; i < bodyString.length; i++) {
    const char = bodyString.charCodeAt(i);
    bodyHash = (bodyHash << 5) - bodyHash + char;
    bodyHash = bodyHash & bodyHash; // Convert to 32bit integer
  }

  return `${userId}:${endpoint}:${Math.abs(bodyHash)}`;
}
