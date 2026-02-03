/**
 * Cluster Configuration for Different Environments
 * Adjust worker counts, heap, and limits based on deployment platform
 */

module.exports = {
  /**
   * RENDER FREE TIER
   * 512MB - 1GB total RAM
   * Limited CPU (shared single core)
   * Auto-sleeps after 15 min inactivity
   */
  free_tier: {
    workers: 4,
    heapPerWorker: 128, // MB per worker (4 × 128 = 512 total)
    maxConnectionsPerWorker: 10, // 10 users × 4 workers = 40 total
    socketConfig: {
      maxConnections: 40,
      perUserLimit: 1,
      pingInterval: 60000,
      pingTimeout: 30000,
    },
    dbConfig: {
      maxPoolSize: 5,
      minPoolSize: 2,
      maxConnecting: 1,
    },
    cacheConfig: {
      ttl: 15, // 15 seconds
      maxSize: "2MB", // Small cache
      strategies: {
        conversations: true,
        notifications: true,
        publicKeys: true,
        messages: false, // Don't cache messages on free tier
        userData: false,
      },
    },
    rateLimiting: {
      chat: { windowMs: 60000, max: 30 }, // 30/min
      api: { windowMs: 60000, max: 15 }, // 15/min
      notifications: { windowMs: 60000, max: 30 },
      auth: { windowMs: 900000, max: 3 }, // 3/15min
      publicKeys: { windowMs: 60000, max: 100 },
      writeOps: { windowMs: 60000, max: 20 },
    },
    expectedUsers: "40-50 concurrent",
    description: "Render free tier - resource constrained",
  },

  /**
   * RENDER PAID TIER
   * $7/month - 1GB dedicated RAM
   * Dedicated CPU (better than free)
   * No auto-sleep
   */
  paid_tier: {
    workers: 4,
    heapPerWorker: 256, // MB per worker (4 × 256 = 1GB)
    maxConnectionsPerWorker: 50, // 50 users × 4 workers = 200 total
    socketConfig: {
      maxConnections: 200,
      perUserLimit: 2,
      pingInterval: 25000,
      pingTimeout: 60000,
    },
    dbConfig: {
      maxPoolSize: 10,
      minPoolSize: 5,
      maxConnecting: 5,
    },
    cacheConfig: {
      ttl: 120, // 2 minutes
      maxSize: "50MB", // Reasonable cache
      strategies: {
        conversations: true,
        notifications: true,
        publicKeys: true,
        messages: true, // Can cache messages
        userData: true,
      },
    },
    rateLimiting: {
      chat: { windowMs: 60000, max: 100 }, // 100/min
      api: { windowMs: 60000, max: 50 }, // 50/min
      notifications: { windowMs: 60000, max: 100 },
      auth: { windowMs: 900000, max: 10 }, // 10/15min
      publicKeys: { windowMs: 60000, max: 500 },
      writeOps: { windowMs: 60000, max: 50 },
    },
    expectedUsers: "100-200 concurrent",
    description: "Render paid tier - balanced resources",
  },

  /**
   * PRODUCTION (AWS, GCP, Azure, etc.)
   * 2GB+ dedicated RAM
   * Multiple cores available
   * Full optimization
   */
  production: {
    workers: 8,
    heapPerWorker: 512, // MB per worker (8 × 512 = 4GB)
    maxConnectionsPerWorker: 100, // 100 users × 8 workers = 800 total
    socketConfig: {
      maxConnections: 800,
      perUserLimit: 5,
      pingInterval: 25000,
      pingTimeout: 60000,
    },
    dbConfig: {
      maxPoolSize: 25,
      minPoolSize: 10,
      maxConnecting: 10,
    },
    cacheConfig: {
      ttl: 3600, // 1 hour
      maxSize: "200MB", // Large cache
      strategies: {
        conversations: true,
        notifications: true,
        publicKeys: true,
        messages: true,
        userData: true,
      },
    },
    rateLimiting: {
      chat: { windowMs: 60000, max: 200 }, // 200/min
      api: { windowMs: 60000, max: 100 }, // 100/min
      notifications: { windowMs: 60000, max: 200 },
      auth: { windowMs: 900000, max: 20 }, // 20/15min
      publicKeys: { windowMs: 60000, max: 1000 },
      writeOps: { windowMs: 60000, max: 100 },
    },
    expectedUsers: "500+ concurrent",
    description: "Full production environment",
  },

  /**
   * DEVELOPMENT
   * Single/dual core for dev machine
   * Large heap for debugging
   * All features enabled
   */
  development: {
    workers: 2,
    heapPerWorker: 512, // Full heap for dev
    maxConnectionsPerWorker: 200, // Don't limit in dev
    socketConfig: {
      maxConnections: 400,
      perUserLimit: 5,
      pingInterval: 25000,
      pingTimeout: 60000,
    },
    dbConfig: {
      maxPoolSize: 10,
      minPoolSize: 5,
      maxConnecting: 5,
    },
    cacheConfig: {
      ttl: 120,
      maxSize: "100MB",
      strategies: {
        conversations: true,
        notifications: true,
        publicKeys: true,
        messages: true,
        userData: true,
      },
    },
    rateLimiting: {
      chat: { windowMs: 60000, max: 1000 }, // Very permissive
      api: { windowMs: 60000, max: 500 },
      notifications: { windowMs: 60000, max: 1000 },
      auth: { windowMs: 900000, max: 50 },
      publicKeys: { windowMs: 60000, max: 5000 },
      writeOps: { windowMs: 60000, max: 500 },
    },
    expectedUsers: "Unlimited (dev)",
    description: "Development environment",
  },

  /**
   * Get config for current environment
   */
  getConfig() {
    const env = process.env.NODE_ENV || "development";
    const tier = process.env.RENDER_PLAN || null;

    // If on Render, use render-specific config
    if (process.env.RENDER === "true") {
      const config = tier === "paid" ? this.paid_tier : this.free_tier;
      console.log(
        `🔧 Using ${tier ? "RENDER " + tier.toUpperCase() : "RENDER FREE TIER"} config`,
      );
      return config;
    }

    // Otherwise use environment-based config
    const config = this[env] || this.development;
    console.log(`🔧 Using ${env.toUpperCase()} config`);
    return config;
  },

  /**
   * Get startup command for different environments
   */
  getStartCommand() {
    const env = process.env.NODE_ENV || "development";

    return {
      development: "node src/cluster.js",
      free_tier:
        "NODE_OPTIONS=--max-old-space-size=128 CLUSTER_WORKERS=4 node src/cluster.js",
      paid_tier:
        "NODE_OPTIONS=--max-old-space-size=256 CLUSTER_WORKERS=4 node src/cluster.js",
      production:
        "NODE_OPTIONS=--max-old-space-size=512 CLUSTER_WORKERS=8 node src/cluster.js",
    };
  },
};
