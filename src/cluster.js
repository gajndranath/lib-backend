/**
 * Node.js Cluster Master
 * Manages multiple worker processes for better resource utilization
 * Especially useful for Render free tier (512MB RAM shared)
 */

const cluster = require("cluster");
const os = require("os");
const path = require("path");

// Get number of workers from environment or CPU count
const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

// For free tier, limit to 4 workers
const maxWorkers = process.env.NODE_ENV === "production" ? numCPUs : 4;
const workersToSpawn = Math.min(numCPUs, maxWorkers);

console.log(`
╔════════════════════════════════════════╗
║     🚀 NODE.JS CLUSTER MANAGER        ║
╚════════════════════════════════════════╝
`);

if (cluster.isMaster) {
  console.log(`👑 Master Process PID: ${process.pid}`);
  console.log(`💻 Available CPUs: ${numCPUs}`);
  console.log(`👷 Workers to spawn: ${workersToSpawn}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`💾 Heap limit: ${process.env.NODE_OPTIONS || "default"}`);
  console.log(`\n🔄 Starting workers...\n`);

  const workers = [];
  let totalRestarts = 0;

  // Fork worker processes
  for (let i = 0; i < workersToSpawn; i++) {
    const worker = cluster.fork();
    workers.push(worker);
    console.log(`   ✅ Worker ${i + 1} forked (PID: ${worker.process.pid})`);
  }

  console.log(`\n✨ All workers started! Ready for requests...\n`);

  // Handle worker exit/crash
  cluster.on("exit", (worker, code, signal) => {
    totalRestarts++;
    const crashReason = signal ? `signal: ${signal}` : `code: ${code}`;

    console.log(`\n❌ Worker ${worker.process.pid} died (${crashReason})`);
    console.log(`🔄 Restarting worker ${totalRestarts}...\n`);

    // Fork replacement worker
    const newWorker = cluster.fork();
    workers[workers.indexOf(worker)] = newWorker;
  });

  // Health check interval
  setInterval(() => {
    const activeWorkers = Object.values(cluster.workers).filter(
      (w) => w && w.isConnected(),
    );
    const status = activeWorkers.length === workersToSpawn ? "✅" : "⚠️";

    console.log(
      `${status} [${new Date().toLocaleTimeString()}] Cluster health: ${activeWorkers.length}/${workersToSpawn} workers active`,
    );

    // Detailed memory info
    if (activeWorkers.length > 0) {
      let totalMem = 0;
      activeWorkers.forEach((w, idx) => {
        const mem = Math.round(w.process.memoryUsage().heapUsed / 1024 / 1024);
        totalMem += mem;
      });
      console.log(`   📊 Total memory used: ${totalMem}MB (from all workers)`);
    }
  }, 30000); // Every 30 seconds

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("\n🛑 SIGTERM received. Shutting down gracefully...");

    // Close all workers
    Object.values(cluster.workers).forEach((worker) => {
      if (worker) worker.kill();
    });

    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("\n🛑 SIGINT received. Shutting down gracefully...");

    // Close all workers
    Object.values(cluster.workers).forEach((worker) => {
      if (worker) worker.kill();
    });

    process.exit(0);
  });
} else {
  // Worker process - load the actual application
  console.log(
    `👷 Worker process ${process.pid} started (Worker ID: ${cluster.worker.id})`,
  );

  // Import and run the main app
  require("./index.js");
}
