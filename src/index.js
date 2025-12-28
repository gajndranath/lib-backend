import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { app } from "./app.js";
import { Server } from "socket.io";
import http from "http";
import "./jobs/reminder.job.js"; // IMPORTING CRON JOB TO ACTIVATE IT
import { socketHandlers } from "./sockets/index.js";

dotenv.config({ path: "./.env" });

const server = http.createServer(app);

// Socket.io initialization with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST"],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store for connected admin tokens (in production, use Redis)
const connectedAdminTokens = new Map();

// Making io accessible in controllers via req.app.get("io")
app.set("io", io);
app.set("adminTokens", connectedAdminTokens);

// Socket event handlers
socketHandlers(io);

// Database connection followed by Server Start
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 8000;

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port: ${PORT}`);
      console.log(`⏰ Cron Jobs are active and monitoring payments.`);
      console.log(`🔔 Web Push configured for background notifications.`);
      console.log(`🔌 Socket.IO server is listening`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
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

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
