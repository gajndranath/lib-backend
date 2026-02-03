import Redis from "ioredis";

const redisClient = new Redis(process.env.REDIS_URL);

class CacheService {
  constructor(redisClient) {
    this.client = redisClient;
    this.defaultTTL = 300; // 5 minutes default
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
   * Delete multiple keys by pattern
   */
  async delPattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Get or set - fetch from cache, if miss execute function and cache result
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
   * Invalidate related cache entries
   */
  async invalidateGroup(prefix) {
    return await this.delPattern(`${prefix}*`);
  }
}

export default new CacheService(redisClient);
