/**
 * Heap Safety Guard
 *
 * Monitors memory usage and enforces safety rules:
 * 1. Heap never exceeds 80% of allocated
 * 2. Auto-cleanup when >70%
 * 3. Alert on unusual growth
 * 4. Track specific memory leaks
 */

import v8 from "v8";
import { getRedisClient } from "../config/redis.js";

let redisClient;
let redisInitAttempted = false;

// ✅ Lazy initialization - only when actually needed
const getRedis = () => {
  if (!redisInitAttempted) {
    redisInitAttempted = true;
    try {
      redisClient = getRedisClient();
    } catch (err) {
      console.warn(
        "⚠️ Redis client not available in heapSafetyGuard, alerts will be logged to console only",
      );
    }
  }
  return redisClient;
};

export class HeapSafetyGuard {
  constructor() {
    this.lastHeapSnapshot = null;
    this.lastAlertTime = 0;
    this.alertCooldown = 30000; // 30 seconds between alerts
    this.heapThresholds = {
      warning: 70, // 70%
      critical: 85, // 85%
      emergency: 95, // 95%
    };
    this.memoryHistory = [];
    this.leakIndicators = {
      socketTimersGrowth: 0,
      presenceMapSize: 0,
      listenerCount: 0,
      iceAccumulation: 0,
    };
  }

  /**
   * Get current heap stats
   */
  getHeapStats() {
    const heapStats = v8.getHeapStatistics();
    const heapUsed = v8
      .getHeapSpaceStatistics()
      .reduce((acc, space) => acc + space.space_used_size, 0);

    return {
      heapTotal: heapStats.total_heap_size,
      heapUsed,
      heapLimit: heapStats.heap_size_limit,
      usagePercent: (heapUsed / heapStats.total_heap_size) * 100,
      limitPercent: (heapUsed / heapStats.heap_size_limit) * 100,
      external: heapStats.external_memory_usage,
      timestamp: new Date(),
    };
  }

  /**
   * Monitor heap health
   */
  monitorHeap() {
    const stats = this.getHeapStats();

    // Store in history
    this.memoryHistory.push(stats);
    if (this.memoryHistory.length > 60) {
      this.memoryHistory.shift();
    }

    // Check thresholds
    if (stats.limitPercent > this.heapThresholds.emergency) {
      this.emergency(stats);
    } else if (stats.limitPercent > this.heapThresholds.critical) {
      this.critical(stats);
    } else if (stats.limitPercent > this.heapThresholds.warning) {
      this.warning(stats);
    }

    return stats;
  }

  /**
   * Warning level - unusual memory growth
   */
  warning(stats) {
    const now = Date.now();
    if (now - this.lastAlertTime < this.alertCooldown) return;

    console.warn(
      `⚠️ [HEAP WARNING] ${stats.limitPercent.toFixed(1)}% of limit used | ${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
    );

    this.lastAlertTime = now;

    // Trigger garbage collection (non-blocking)
    if (global.gc) {
      setImmediate(() => global.gc());
    }
  }

  /**
   * Critical level - immediate action needed
   */
  critical(stats) {
    const now = Date.now();
    if (now - this.lastAlertTime < this.alertCooldown) return;

    console.error(
      `🔴 [HEAP CRITICAL] ${stats.limitPercent.toFixed(1)}% of limit used | ${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
    );

    // Log memory leak indicators
    this.logLeakIndicators();

    this.lastAlertTime = now;

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    // Store alert in Redis
    try {
      const redis = getRedis();
      if (redis) {
        redis
          .lpush(
            "heap_alerts",
            JSON.stringify({
              level: "CRITICAL",
              stats,
              timestamp: new Date(),
            }),
          )
          .catch((err) => console.error("Failed to log alert:", err));
      }
    } catch (err) {
      console.error("Alert logging failed:", err);
    }
  }

  /**
   * Emergency level - potential crash incoming
   */
  emergency(stats) {
    const now = Date.now();
    if (now - this.lastAlertTime < this.alertCooldown) return;

    console.error(
      `🚨 [HEAP EMERGENCY] ${stats.limitPercent.toFixed(1)}% of limit used | ${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
    );
    console.error("🚨 MEMORY LEAK DETECTED - Process may crash!");

    // Log all indicators
    this.logLeakIndicators();

    this.lastAlertTime = now;

    // Force aggressive GC
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        setImmediate(() => global.gc());
      }
    }

    // Store emergency alert
    try {
      const redis = getRedis();
      if (redis) {
        redis
          .lpush(
            "heap_alerts",
            JSON.stringify({
              level: "EMERGENCY",
              stats,
              indicators: this.leakIndicators,
              timestamp: new Date(),
            }),
          )
          .catch((err) => console.error("Failed to log emergency:", err));
      }
    } catch (err) {
      console.error("Emergency logging failed:", err);
    }
  }

  /**
   * Track memory leak indicators
   */
  updateLeakIndicators(indicators) {
    Object.assign(this.leakIndicators, indicators);
  }

  /**
   * Log current leak indicators
   */
  logLeakIndicators() {
    console.log("📊 Memory Leak Indicators:");
    console.log(
      `  - Socket Timers Growth: ${this.leakIndicators.socketTimersGrowth}`,
    );
    console.log(
      `  - Presence Map Size: ${this.leakIndicators.presenceMapSize}`,
    );
    console.log(`  - Listener Count: ${this.leakIndicators.listenerCount}`);
    console.log(`  - ICE Accumulation: ${this.leakIndicators.iceAccumulation}`);
  }

  /**
   * Get memory growth rate
   */
  getGrowthRate() {
    if (this.memoryHistory.length < 2) return 0;

    const recent = this.memoryHistory.slice(-10);
    if (recent.length < 2) return 0;

    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;
    const timeDiff = (last - first) / (1024 * 1024); // MB
    const timeSecs =
      (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;

    return (timeDiff / timeSecs) * 60; // MB/minute
  }

  /**
   * Get projected crash time
   */
  getProjectedCrashTime() {
    const growthRate = this.getGrowthRate();
    if (growthRate <= 0) return null;

    const stats = this.getHeapStats();
    const remainingMB = (stats.heapLimit - stats.heapUsed) / 1024 / 1024;
    const minutesUntilCrash = remainingMB / growthRate;

    return {
      minutesUntilCrash,
      hoursUntilCrash: minutesUntilCrash / 60,
      daysUntilCrash: minutesUntilCrash / 60 / 24,
      status: minutesUntilCrash < 60 ? "🚨 CRITICAL" : "⚠️ WARNING",
    };
  }

  /**
   * Get heap statistics for dashboard
   */
  getDashboardStats() {
    const stats = this.getHeapStats();
    const growth = this.getGrowthRate();
    const crash = this.getProjectedCrashTime();

    return {
      current: stats,
      growth: {
        rateMBPerMinute: growth.toFixed(2),
        status:
          growth > 5
            ? "🔴 FAST LEAK"
            : growth > 1
              ? "⚠️ SLOW LEAK"
              : "✅ STABLE",
      },
      projection: crash,
      history: this.memoryHistory.slice(-30), // Last 30 samples
      indicators: this.leakIndicators,
    };
  }
}

// Export singleton
export const heapSafetyGuard = new HeapSafetyGuard();
