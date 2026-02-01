import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import errorHandler from "./middlewares/error.middleware.js";
import { apiLimiter } from "./middlewares/rateLimiter.middleware.js";

const app = express();

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Apply rate limiting to all requests
app.use(apiLimiter);

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "https://lib-frontend-roan.vercel.app/",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
      "X-Retry",
    ],
  }),
);

// Body parser middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ limit: "16kb", extended: true }));

// Cookie parser
app.use(cookieParser());

// Import routes
import studentRouter from "./routes/student.routes.js";
import studentAuthRouter from "./routes/studentAuth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import slotRouter from "./routes/slot.routes.js";
import feeRouter from "./routes/fee.routes.js";
import reminderRouter from "./routes/reminder.routes.js";

// Register routes
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/student-auth", studentAuthRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/slots", slotRouter);
app.use("/api/v1/fees", feeRouter);
app.use("/api/v1/reminders", reminderRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date(),
    service: "Library Management System",
    version: "2.0.0",
    features: [
      "Immutable Ledger System",
      "Centralized Reminder Engine",
      "Slot-based Seat Management",
      "Advance & Due Tracking",
      "Complete Audit Trail",
    ],
  });
});

// System info endpoint
app.get("/system/info", (req, res) => {
  res.json({
    system: "Library Management System",
    architecture: "Service-based Modular",
    database: "MongoDB with Immutable Ledger",
    features: {
      financial: "Month-wise immutable fee records",
      reminders: "Centralized reminder engine",
      slots: "Dynamic slot and seat management",
      audit: "Complete admin action logging",
      notifications: "Multi-channel (Email, Push, Socket)",
    },
    constraints: [
      "No student record deletion",
      "No race conditions in seat allocation",
      "No duplicate reminders",
      "No silent fee modifications",
    ],
  });
});

// 404 handler - must come before error handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "Route not found",
    errors: [],
  });
});

// Centralized Error Handling
app.use(errorHandler);

export { app };
