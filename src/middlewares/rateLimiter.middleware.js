import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

const redisClient = new Redis(process.env.REDIS_URL);

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

// GENERAL API LIMITER - Moderate for all endpoints
export const apiLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:api:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute per user/IP
  message: "Too many requests. Please wait a moment before trying again.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
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
});

// LENIENT LIMITER - For high-traffic endpoints (chat, notifications)
export const chatLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:chat:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute (very high for chat)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Chat rate limit exceeded. Messages sent too quickly.",
    });
  },
});

// NOTIFICATION LIMITER - High frequency updates
export const notificationLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:notif:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // 150 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// AUTHENTICATION RATE LIMITER - Stricter limits
export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:auth:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
  message: "Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Too many login attempts. Please try again after 15 minutes.",
    });
  },
});

// OTP RATE LIMITER
export const otpLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:otp:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 OTP requests per hour
  message: "Too many OTP requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// PUBLIC KEY LIMITER - Cached heavily, can be very lenient
export const publicKeyLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:pk:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute (heavily cached)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      statusCode: 429,
      message: "Public key rate limit exceeded.",
    });
  },
});

// WRITE OPERATION LIMITER - POST/PUT/DELETE requests
export const writeLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:write:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 write operations per minute
  keyGenerator,
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
});

// QUERY LIMITER - GET requests for heavy queries
export const queryLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:query:",
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 queries per minute
  keyGenerator,
  skip: (req) => {
    // Only apply to read methods
    return req.method !== "GET";
  },
});
