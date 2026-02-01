import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

// Check if Redis URL is provided
if (!process.env.REDIS_URL) {
  console.warn("REDIS_URL not set, using in-memory store for rate limiting");
}

let redisClient;
let store;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);

  redisClient.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  store = new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  });
} else {
  // Fallback to memory store
  store = new rateLimit.MemoryStore();
  console.log("Using in-memory store for rate limiting");
}

export const apiLimiter = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 login attempts per 15 minutes
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});
