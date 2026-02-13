import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

let redisClient;
let redisInitialized = false;

function initializeRedis() {
  if (redisInitialized) return;
  redisInitialized = true;

  // Check if Redis URL is provided
  if (!process.env.REDIS_URL) {
    // Silent skip - Redis is optional, rate limiting has fallback
    return;
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
      console.error("❌ Redis connection error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected successfully");
    });

    redisClient.on("ready", () => {
      console.log("✅ Redis is ready to accept commands");
    });
  } catch (error) {
    console.error("❌ Failed to initialize Redis:", error.message);
    redisClient = null;
  }
}

// ✅ RULE 9: Export Redis client for use with TTL
export const getRedisClient = () => {
  initializeRedis(); // Lazy initialization

  if (!redisClient) {
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
