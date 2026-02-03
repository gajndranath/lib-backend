/**
 * Memory Monitoring Utility
 * Tracks heap usage and detects memory leaks in cluster environments
 */

const cluster = require("cluster");
const fs = require("fs");
const path = require("path");
const v8 = require("v8");

class MemoryMonitor {
  constructor(options = {}) {
    this.interval = options.interval || 10000; // Check every 10 seconds
    this.warningThreshold = options.warningThreshold || 0.85; // 85% of heap
    this.criticalThreshold = options.criticalThreshold || 0.95; // 95% of heap
    this.snapshotDir = options.snapshotDir || path.join(__dirname, "../heaps");
    this.enableSnapshots = options.enableSnapshots !== false;
    this.history = [];
    this.maxHistory = options.maxHistory || 100;

    this.ensureSnapshotDir();
  }

  ensureSnapshotDir() {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  /**
   * Start monitoring
   */
  start() {
    console.log(`🔍 Memory monitor started (check every ${this.interval}ms)`);

    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, this.interval);

    // Also check on exit
    process.on("exit", () => this.stop());
    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      console.log("🛑 Memory monitor stopped");
    }
  }

  /**
   * Check current memory usage
   */
  checkMemory() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const heapPercent = used.heapUsed / used.heapTotal;
    const externalMB = Math.round(used.external / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);

    const memoryData = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      worker: cluster.worker?.id,
      heap: {
        used: heapUsedMB,
        total: heapTotalMB,
        percent: Math.round(heapPercent * 100),
      },
      external: externalMB,
      rss: rssMB,
    };

    // Store in history
    this.history.push(memoryData);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Check thresholds
    if (heapPercent >= this.criticalThreshold) {
      this.handleCritical(memoryData);
    } else if (heapPercent >= this.warningThreshold) {
      this.handleWarning(memoryData);
    }

    return memoryData;
  }

  /**
   * Handle warning level memory usage
   */
  handleWarning(data) {
    console.warn(`
⚠️  WARNING: High heap usage detected!
   Heap: ${data.heap.used}MB / ${data.heap.total}MB (${data.heap.percent}%)
   External: ${data.external}MB
   RSS: ${data.rss}MB
   PID: ${data.pid}${data.worker ? ` (Worker ${data.worker})` : ""}
   Time: ${data.timestamp}
    `);

    // Check if usage is growing (memory leak indicator)
    if (this.isMemoryGrowing()) {
      console.warn("📈 Memory is continuously growing - possible memory leak!");
    }
  }

  /**
   * Handle critical level memory usage
   */
  handleCritical(data) {
    console.error(`
🔴 CRITICAL: Heap usage at critical level!
   Heap: ${data.heap.used}MB / ${data.heap.total}MB (${data.heap.percent}%)
   External: ${data.external}MB
   RSS: ${data.rss}MB
   PID: ${data.pid}${data.worker ? ` (Worker ${data.worker})` : ""}
   Time: ${data.timestamp}
   
   ACTION: App may crash soon!
    `);

    // Take heap snapshot if enabled
    if (this.enableSnapshots) {
      this.takeHeapSnapshot();
    }

    // Emit warning event that app can listen to
    if (process.send) {
      process.send({
        type: "memory_critical",
        data,
      });
    }
  }

  /**
   * Detect if memory is growing (leak indicator)
   */
  isMemoryGrowing() {
    if (this.history.length < 10) return false;

    const recent = this.history.slice(-10);
    const older = this.history.slice(-20, -10);

    if (older.length === 0) return false;

    const avgRecent =
      recent.reduce((sum, h) => sum + h.heap.used, 0) / recent.length;
    const avgOlder =
      older.reduce((sum, h) => sum + h.heap.used, 0) / older.length;

    // Growing if recent avg is 10% higher than older avg
    return avgRecent > avgOlder * 1.1;
  }

  /**
   * Take heap snapshot
   */
  takeHeapSnapshot() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `heap-${process.pid}-${timestamp}.heapsnapshot`;
    const filepath = path.join(this.snapshotDir, filename);

    try {
      v8.writeHeapSnapshot(filepath);
      console.log(`💾 Heap snapshot saved: ${filepath}`);
      return filepath;
    } catch (err) {
      console.error(`❌ Failed to save heap snapshot: ${err.message}`);
    }
  }

  /**
   * Get memory statistics
   */
  getStats() {
    if (this.history.length === 0) return null;

    const heaps = this.history.map((h) => h.heap.used);
    const sorted = [...heaps].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return {
      current: this.history[this.history.length - 1],
      average: Math.round(heaps.reduce((a, b) => a + b, 0) / heaps.length),
      min: Math.min(...heaps),
      max: Math.max(...heaps),
      median:
        sorted.length % 2 === 0
          ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
          : sorted[mid],
      trend: this.isMemoryGrowing() ? "growing ⬆️" : "stable ➡️",
      sampleSize: heaps.length,
    };
  }

  /**
   * Get history
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /**
   * Reset history
   */
  resetHistory() {
    this.history = [];
  }

  /**
   * Create monitoring report
   */
  generateReport() {
    const stats = this.getStats();
    if (!stats) {
      return "No monitoring data available yet";
    }

    return `
╔════════════════════════════════════════╗
║       📊 MEMORY MONITORING REPORT      ║
╚════════════════════════════════════════╝

Current Status:
├─ Heap Used: ${stats.current.heap.used}MB / ${stats.current.heap.total}MB
├─ Heap %: ${stats.current.heap.percent}%
├─ External: ${stats.current.external}MB
├─ RSS: ${stats.current.rss}MB
├─ PID: ${stats.current.pid}
└─ Time: ${stats.current.timestamp}

Statistics (Last ${stats.sampleSize} samples):
├─ Average: ${stats.average}MB
├─ Min: ${stats.min}MB
├─ Max: ${stats.max}MB
├─ Median: ${stats.median}MB
└─ Trend: ${stats.trend}

Recommendation:
${stats.current.heap.percent > 90 ? "⚠️  High usage - consider optimization" : "✅ Healthy memory usage"}
${stats.trend === "growing ⬆️" ? "🔴 Memory is growing - check for leaks" : "✅ Memory stable"}
    `;
  }
}

module.exports = MemoryMonitor;
