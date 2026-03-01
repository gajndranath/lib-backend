import "./config/env.js";
import logger from "./utils/logger.js";
import connectDB from "./config/db.js";
import { app } from "./app.js";
import { Server } from "socket.io";
import http from "http";
import { socketHandlers } from "./sockets/index.js";
import { initializeFirebase } from "./config/firebase.config.js";
import { initializeWebPush } from "./config/webpush.config.js";
import "./jobs/reminder.job.js"; // IMPORTING CRON JOB TO ACTIVATE IT
import { initRedisForRateLimiting } from "./middlewares/rateLimiter.middleware.js";
import { initializeEmail } from "./config/email.config.js";
// Initialize notification services
(async () => {
  logger.info("🚀 Server initialization started", {
    env: process.env.NODE_ENV,
  });

  // ✅ Initialize Redis for rate limiting FIRST (after dotenv)
  initRedisForRateLimiting();
  await initializeEmail();
  initializeFirebase(); // ✅ Await email initialization with retries
  initializeWebPush();

  // Continue with server setup
  const server = http.createServer(app);

  // Socket.io initialization with optimized config
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
        : [],
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization", "Content-Type"],
    },
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1024 * 256, // 256KB
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  // Track connected admin tokens
  const connectedAdminTokens = new Map();

  // Make io accessible via app
  app.set("io", io);
  app.set("adminTokens", connectedAdminTokens);

  // Socket event handlers
  socketHandlers(io);

  // Database connection followed by Server Start
  connectDB()
    .then(() => {
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
        logger.info(
          `🔔 Web Push: ${
            process.env.PUBLIC_VAPID_KEY ? "✅ Configured" : "❌ Not configured"
          }`,
        );
        logger.info("🔌 Socket.IO server is listening with optimized settings");
        logger.info(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        logger.info(
          "⚙️  Rate limiting: ENABLED with per-endpoint optimization",
        );
        logger.info("💾 Memory management: ENABLED");
        logger.info("🔄 Connection pooling: ENABLED (25 max connections)");
      });
    })
    .catch((err) => {
      logger.error("❌ MongoDB connection error", {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
      logger.info("Process terminated");
    });
  });
})();

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", {
    reason: String(reason),
    promise: String(promise),
  });
});
