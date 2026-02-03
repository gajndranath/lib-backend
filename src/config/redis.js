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
    console.error("❌ Redis connection error:", err);
  });

  redisClient.on("connect", () => {
    console.log("✅ Redis connected");
  });

  store = new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  });
} else {
  // Fallback to default memory store (built-in to express-rate-limit)
  store = undefined; // express-rate-limit will use its default MemoryStore
  console.log("⚠️ Using in-memory store for rate limiting (not ideal)");
}

// ✅ RULE 9: Export Redis client for use with TTL
export const getRedisClient = () => {
  if (!redisClient) {
    console.warn("⚠️ Redis not available, operations will be async-only");
    // Return a no-op client
    return {
      setEx: () => Promise.resolve(),
      del: () => Promise.resolve(),
      lpush: () => Promise.resolve(),
      expire: () => Promise.resolve(),
      lrange: () => Promise.resolve([]),
      get: () => Promise.resolve(null),
    };
  }
  return redisClient;
};

// ✅ RULE 10: Monitor Redis memory
export const monitorRedisMemory = async () => {
  if (!redisClient) return;

  try {
    const info = await redisClient.info("memory");
    const used = info.split("used_memory_human:")[1]?.split("\r")[0];
    const peak = info.split("used_memory_peak_human:")[1]?.split("\r")[0];

    console.log(`Redis Memory: ${used} (peak: ${peak})`);

    // Alert if Redis using too much
    if (info.includes("used_memory_percent") && info.includes("90")) {
      console.warn("⚠️ Redis memory usage >90%");
    }
  } catch (err) {
    console.error("❌ Redis memory check failed:", err);
  }
};

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
