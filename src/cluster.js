/**
 * Node.js Cluster Master — ESM-compatible
 * Manages multiple worker processes for better resource utilization.
 *
 * NOTE: cluster and os are CommonJS built-ins. We use createRequire to
 * import them inside an ESM module without breaking the ESM project.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const cluster = require("cluster");
const os = require("os");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get number of workers from environment or CPU count
const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

// Cap workers: 2 in dev, all CPUs in production
const maxWorkers = process.env.NODE_ENV === "production" ? numCPUs : 2;
const workersToSpawn = Math.min(numCPUs, maxWorkers);

console.log(`
╔════════════════════════════════════════╗
║     🚀 NODE.JS CLUSTER MANAGER        ║
╚════════════════════════════════════════╝
`);

if (cluster.isPrimary) {
  console.log(`👑 Master Process PID: ${process.pid}`);
  console.log(`💻 Available CPUs: ${numCPUs}`);
  console.log(`👷 Workers to spawn: ${workersToSpawn}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`\n🔄 Starting workers...\n`);

  // Fork worker processes
  for (let i = 0; i < workersToSpawn; i++) {
    const worker = cluster.fork();
    console.log(`   ✅ Worker ${i + 1} forked (PID: ${worker.process.pid})`);
  }

  console.log(`\n✨ All workers started! Ready for requests...\n`);

  let totalRestarts = 0;

  // Handle worker exit/crash — restart automatically
  cluster.on("exit", (worker, code, signal) => {
    totalRestarts++;
    const crashReason = signal ? `signal: ${signal}` : `code: ${code}`;
    console.log(`\n❌ Worker ${worker.process.pid} died (${crashReason})`);
    console.log(`🔄 Restarting worker (restart #${totalRestarts})...\n`);
    cluster.fork();
  });

  // Health check every 30 seconds
  setInterval(() => {
    const activeWorkers = Object.values(cluster.workers).filter(
      (w) => w && w.isConnected(),
    );
    const status = activeWorkers.length === workersToSpawn ? "✅" : "⚠️";
    console.log(
      `${status} [${new Date().toLocaleTimeString()}] Cluster: ${activeWorkers.length}/${workersToSpawn} workers active`,
    );
  }, 30000);

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
    Object.values(cluster.workers).forEach((w) => w && w.kill());
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} else {
  // Worker process — load the actual application
  console.log(
    `👷 Worker ${process.pid} started (Worker ID: ${cluster.worker.id})`,
  );

  // Dynamically import the ESM entry point
  import(join(__dirname, "index.js")).catch((err) => {
    console.error(`❌ Worker ${process.pid} failed to start:`, err);
    process.exit(1);
  });
}
