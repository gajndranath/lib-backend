import { getRedisClient } from "../config/redis.js";

class CacheService {
  get client() {
    return getRedisClient();
  }

  get defaultTTL() {
    return 300; // 5 minutes default
  }

  /**
   * Get cached value
   */
  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern using SCAN (production-safe, no KEYS blocking)
   */
  async delPattern(pattern) {
    try {
      const client = this.client;
      // Use SCAN instead of KEYS to avoid blocking Redis in production
      if (typeof client.scanStream === "function") {
        // ioredis supports scanStream
        const stream = client.scanStream({ match: pattern, count: 100 });
        const keys = [];
        await new Promise((resolve, reject) => {
          stream.on("data", (batch) => keys.push(...batch));
          stream.on("end", resolve);
          stream.on("error", reject);
        });
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } else {
        // Fallback for no-op client (Redis not configured)
        const keys = await client.keys?.(pattern);
        if (keys && keys.length > 0) {
          await client.del(...keys);
        }
      }
      return true;
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Get or set — fetch from cache; on miss, execute fn and cache result
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    try {
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      const value = await fetchFn();
      await this.set(key, value, ttl);
      return value;
    } catch (error) {
      console.error(`Cache getOrSet error for key ${key}:`, error);
      // Fall back to direct execution if cache fails
      return await fetchFn();
    }
  }

  /**
   * Invalidate all cache entries with a given prefix
   */
  async invalidateGroup(prefix) {
    return await this.delPattern(`${prefix}*`);
  }
}

export default new CacheService();
