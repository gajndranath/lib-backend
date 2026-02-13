import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config();

async function testRedis() {
  console.log("🔴 Testing Redis Connection...\n");
  console.log("Redis URL:", process.env.REDIS_URL || "❌ Not Set");
  console.log();

  if (!process.env.REDIS_URL) {
    console.log("⚠️  REDIS_URL not set in .env file");
    console.log(
      "App will use in-memory store for rate limiting (works fine for development)",
    );
    return;
  }

  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected successfully!");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
  });

  try {
    // Test basic operations
    await redis.set("test_key", "test_value");
    const value = await redis.get("test_key");
    await redis.del("test_key");

    console.log("✅ Redis operations working correctly!");
    console.log("Test value retrieved:", value);

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error("❌ Redis test failed:", error.message);
    console.log(
      "\n⚠️  Redis is not accessible. App will fall back to in-memory store.",
    );
    console.log("This is fine for development, but you may want to:");
    console.log("1. Install Redis locally: https://redis.io/download");
    console.log(
      "2. Or use in-memory store by commenting out REDIS_URL in .env",
    );
    process.exit(1);
  }
}

testRedis();
