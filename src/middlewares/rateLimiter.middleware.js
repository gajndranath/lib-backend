import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

// Lazy initialization of Redis client
let redisClient = null;
let redisInitAttempted = false;

// ✅ Export this to be called explicitly from index.js after dotenv loads
export const initRedisForRateLimiting = () => {
  if (redisInitAttempted) return redisClient;
  redisInitAttempted = true;

  if (!process.env.REDIS_URL) {
    console.log("ℹ️  Redis not configured - using in-memory rate limiting");
    return null;
  }

  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis rate limiter error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected for rate limiting");
    });

    redisClient.on("ready", () => {
      console.log("✅ Redis ready for rate limiting");
    });

    return redisClient;
  } catch (error) {
    console.error("❌ Failed to initialize Redis client:", error.message);
    return null;
  }
};

// Key generator function to handle both IP and forwarded headers
const keyGenerator = (req) => {
  // In production, use user ID if authenticated, fallback to IP
  if (req.user?.id || req.user?._id) {
    return `user:${req.user.id || req.user._id}`;
  }
  // In production behind a proxy, use X-Forwarded-For
  if (process.env.NODE_ENV === "production") {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
  }
  return ipKeyGenerator(req);
};

// Helper to create rate limiter config with optional Redis store
const createLimiterConfig = (prefix, options) => {
  // ✅ Don't initialize here - will be done from index.js
  const config = {
    ...options,
    keyGenerator,
  };

  // Only add Redis store if client is available (after explicit init)
  if (redisClient) {
    config.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `rl:${prefix}:`,
    });
  }
  // Otherwise, express-rate-limit will use default memory store

  return config;
};

// GENERAL API LIMITER - Moderate for all endpoints
export const apiLimiter = rateLimit(
  createLimiterConfig("api", {
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 60, // 60 requests per minute per user/IP
    message: "Too many requests. Please wait a moment before trying again.",
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
    skip: (req) => {
      // Skip rate limiting for health check
      return req.path === "/api/v1/health";
    },
  }),
);

// LENIENT LIMITER - For high-traffic endpoints (chat, notifications)
export const chatLimiter = rateLimit(
  createLimiterConfig("chat", {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute (very high for chat)
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        message: "Chat rate limit exceeded. Messages sent too quickly.",
      });
    },
  }),
);

// NOTIFICATION LIMITER - High frequency updates
export const notificationLimiter = rateLimit(
  createLimiterConfig("notif", {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 150, // 150 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// AUTHENTICATION RATE LIMITER - Stricter limits
export const authLimiter = rateLimit(
  createLimiterConfig("auth", {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 minutes
    message: "Too many login attempts. Please try again later.",
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
  }),
);

// OTP RATE LIMITER
export const otpLimiter = rateLimit(
  createLimiterConfig("otp", {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 OTP requests per hour
    message: "Too many OTP requests. Please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// PUBLIC KEY LIMITER - Cached heavily, can be very lenient
export const publicKeyLimiter = rateLimit(
  createLimiterConfig("pubkey", {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // 1000 requests per minute (heavily cached)
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        message: "Public key rate limit exceeded.",
      });
    },
  }),
);

// WRITE OPERATION LIMITER - POST/PUT/DELETE requests
export const writeLimiter = rateLimit(
  createLimiterConfig("write", {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 write operations per minute
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        message: "Write operation rate limit exceeded.",
      });
    },
    skip: (req) => {
      // Only apply to write methods
      return !["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
    },
  }),
);

// QUERY LIMITER - GET requests for heavy queries
export const queryLimiter = rateLimit(
  createLimiterConfig("query", {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 queries per minute
    skip: (req) => {
      // Only apply to read methods
      return req.method !== "GET";
    },
  }),
);
