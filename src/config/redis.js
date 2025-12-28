import Redis from "ioredis";

const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("connect", () => console.log("✅ Redis Connected Successfully"));
redisClient.on("error", (err) =>
  console.error("❌ Redis Connection Error:", err)
);

export default redisClient;
