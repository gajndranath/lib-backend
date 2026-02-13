import dotenv from "dotenv";

// ✅ Load environment variables FIRST before importing anything else
dotenv.config({ path: "./.env" });

import logger from "./utils/logger.js";
import connectDB from "./config/db.js";
import { app } from "./app.js";
import { Server } from "socket.io";
import http from "http";
import { socketHandlers } from "./sockets/index.js";
import { initializeFirebase } from "./config/firebase.config.js";
import { initializeEmail } from "./config/email.config.js";
import { initializeWebPush } from "./config/webpush.config.js";
import {
  socketOptimizationConfig,
  SocketConnectionPoolManager,
  setupSocketMemoryManagement,
} from "./utils/socketOptimizer.js";
import { monitorConnectionPool } from "./utils/queryOptimizations.js";
import "./jobs/reminder.job.js"; // IMPORTING CRON JOB TO ACTIVATE IT
import { initRedisForRateLimiting } from "./middlewares/rateLimiter.middleware.js";

// Initialize notification services
(async () => {
  logger.info("🚀 Server initialization started", {
    env: process.env.NODE_ENV,
  });

  // ✅ Initialize Redis for rate limiting FIRST (after dotenv)
  initRedisForRateLimiting();

  initializeFirebase();
  await initializeEmail(); // ✅ Await email initialization with retries
  initializeWebPush();

  // Continue with server setup
  const server = http.createServer(app);

  // Socket.io initialization with OPTIMIZED CONFIG
  const io = new Server(server, {
    cors: {
      origin:
        process.env.CORS_ORIGIN?.split(",") || [" http://localhost:5173"] ||
        "http://localhost:3000",
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
    },
    ...socketOptimizationConfig,
  });

  // Initialize socket connection pool manager
  const socketPoolManager = new SocketConnectionPoolManager(io);
  global.socketPoolManager = socketPoolManager;

  // Store for connected admin tokens
  const connectedAdminTokens = new Map();

  // Making io accessible globally and in controllers
  global.io = io;
  app.set("io", io);
  app.set("adminTokens", connectedAdminTokens);

  // Setup socket memory management and monitoring
  setupSocketMemoryManagement(io);

  // Socket event handlers
  socketHandlers(io);

  // Database connection followed by Server Start
  connectDB()
    .then(() => {
      // Monitor database connection pool
      monitorConnectionPool();

      const PORT = process.env.PORT || 8000;

      server.listen(PORT, () => {
        logger.info(`✅ Server running on port: ${PORT}`, {
          port: PORT,
          environment: process.env.NODE_ENV,
        });
        logger.info("⏰ Cron Jobs are active and monitoring payments");
        logger.info(
          `📧 Email service: ${
            process.env.EMAIL_USER ? "✅ Configured" : "❌ Not configured"
          }`,
        );
        logger.info(
          `🔥 Firebase: ${
            process.env.FIREBASE_PROJECT_ID
              ? "✅ Configured"
              : "❌ Not configured"
          }`,
        );
        console.log(
          `🔔 Web Push: ${
            process.env.PUBLIC_VAPID_KEY ? "✅ Configured" : "❌ Not configured"
          }`,
        );
        console.log(`🔌 Socket.IO server is listening with optimized settings`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(
          `⚙️  Rate limiting: ENABLED with per-endpoint optimization`,
        );
        console.log(`💾 Memory management: ENABLED`);
        console.log(`🔄 Connection pooling: ENABLED (25 max connections)`);
      });
    })
    .catch((err) => {
      console.error("❌ MongoDB connection error: ", err);
      process.exit(1);
    });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
      console.log("Process terminated");
    });
  });
})();

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
