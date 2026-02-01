import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { app } from "./app.js";
import { Server } from "socket.io";
import http from "http";
import { socketHandlers } from "./sockets/index.js";
import { initializeFirebase } from "./config/firebase.config.js";
import { initializeEmail } from "./config/email.config.js";
import { initializeWebPush } from "./config/webpush.config.js";
import "./jobs/reminder.job.js"; // IMPORTING CRON JOB TO ACTIVATE IT

dotenv.config({ path: "./.env" });

// Initialize notification services
initializeFirebase();
initializeEmail();
initializeWebPush();

const server = http.createServer(app);

// Socket.io initialization with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store for connected admin tokens
const connectedAdminTokens = new Map();

// Making io accessible globally and in controllers
global.io = io;
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
      console.log(
        `📧 Email service: ${
          process.env.EMAIL_USER ? "✅ Configured" : "❌ Not configured"
        }`
      );
      console.log(
        `🔥 Firebase: ${
          process.env.FIREBASE_PROJECT_ID
            ? "✅ Configured"
            : "❌ Not configured"
        }`
      );
      console.log(
        `🔔 Web Push: ${
          process.env.PUBLIC_VAPID_KEY ? "✅ Configured" : "❌ Not configured"
        }`
      );
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
