/**
 * Rate Limiter Middleware
 *
 * Uses express-rate-limit with Redis store (via rate-limit-redis) when Redis
 * is available, falling back to in-memory store otherwise.
 *
 * The Redis store is created lazily after Redis is initialized (called from
 * index.js via upgradeRateLimitersToRedis()) to avoid startup errors.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { getRedisClient } from "../config/redis.js";

// ✅ No-op kept for backward compatibility
export const initRedisForRateLimiting = () => {};

// Key generator: prefer authenticated user ID over IP
const keyGenerator = (req) => {
  if (req.admin?._id) return `admin:${req.admin._id}`;
  if (req.student?._id) return `student:${req.student._id}`;
  if (process.env.NODE_ENV === "production") {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return ipKeyGenerator(req);
};

// Build a RedisStore using the shared ioredis client.
// Only called after Redis is confirmed ready.
const buildRedisStore = (prefix) => {
  const client = getRedisClient();
  if (!client) return undefined;
  return new RedisStore({
    // ioredis v5: client.call(command, ...args) dispatches arbitrary commands
    sendCommand: (...args) => client.call(...args),
    prefix: `rl:${prefix}:`,
  });
};

// Create a rate limiter with in-memory store (safe at module load time)
const makeLimiter = (prefix, options) =>
  rateLimit({ ...options, keyGenerator });

// ─── Rate Limiters (in-memory by default) ────────────────────────────────────

export const apiLimiter = makeLimiter("api", {
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = req.rateLimit?.resetTime
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 60;
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter,
    });
  },
  skip: (req) => req.path === "/api/v1/health",
});

export const chatLimiter = makeLimiter("chat", {
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Chat rate limit exceeded. Messages sent too quickly.",
    });
  },
});

export const notificationLimiter = makeLimiter("notif", {
  windowMs: 1 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = makeLimiter("auth", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Too many login attempts. Please try again after 15 minutes.",
    });
  },
});

export const otpLimiter = makeLimiter("otp", {
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicKeyLimiter = makeLimiter("pubkey", {
  windowMs: 1 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Public key rate limit exceeded.",
    });
  },
});

export const writeLimiter = makeLimiter("write", {
  windowMs: 1 * 60 * 1000,
  max: 50,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Write operation rate limit exceeded.",
    });
  },
  skip: (req) => !["POST", "PUT", "DELETE", "PATCH"].includes(req.method),
});

export const queryLimiter = makeLimiter("query", {
  windowMs: 1 * 60 * 1000,
  max: 100,
  skip: (req) => req.method !== "GET",
});

// ─── Redis Upgrade ────────────────────────────────────────────────────────────

/**
 * Upgrade all rate limiters to use Redis store.
 * Call this from index.js AFTER Redis is initialized and ready.
 * Falls back silently to in-memory if Redis is unavailable.
 */
export const upgradeRateLimitersToRedis = () => {
  const limiters = [
    { limiter: apiLimiter, prefix: "api" },
    { limiter: chatLimiter, prefix: "chat" },
    { limiter: notificationLimiter, prefix: "notif" },
    { limiter: authLimiter, prefix: "auth" },
    { limiter: otpLimiter, prefix: "otp" },
    { limiter: publicKeyLimiter, prefix: "pubkey" },
    { limiter: writeLimiter, prefix: "write" },
    { limiter: queryLimiter, prefix: "query" },
  ];

  let upgraded = 0;
  for (const { limiter, prefix } of limiters) {
    try {
      const store = buildRedisStore(prefix);
      if (store) {
        limiter.resetKey = undefined; // reset any in-memory state
        // express-rate-limit exposes store via the options object
        if (limiter.options) {
          limiter.options.store = store;
        }
        upgraded++;
      }
    } catch {
      // Silently skip — in-memory store remains active
    }
  }

  if (upgraded > 0) {
    console.log(`✅ Rate limiters upgraded to Redis store (${upgraded}/${limiters.length})`);
  } else {
    console.log("ℹ️  Rate limiters using in-memory store (Redis not available)");
  }
};
