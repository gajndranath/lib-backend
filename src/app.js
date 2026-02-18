import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import errorHandler from "./middlewares/error.middleware.js";
import { deduplicationMiddleware } from "./middlewares/deduplication.middleware.js";
import { heapSafetyGuard } from "./utils/heapSafetyGuard.js";
import logger, { httpLogger } from "./utils/logger.js";

const app = express();

// ✅ Start memory monitoring (every 30 seconds)
setInterval(() => {
  heapSafetyGuard.monitorHeap();
}, 30000);

// HTTP Request Logging Middleware
app.use(httpLogger);

// Trust proxy - important for HTTPS detection behind load balancers
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Compression middleware - compress all responses
app.use(compression());

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// CORS configuration - validate origins
const allowedOrigins = [
  "http://localhost:5173", // Vite default
  "http://localhost:3000", // CRA default
  "http://127.0.0.1:5173",
  ...(process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : []),
];

// 2. CORS Options Setup
const corsOptions = {
  origin: (origin, callback) => {
    // !origin allows server-to-server, mobile apps, or tools like Postman
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV === "development"
    ) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy violation: This origin is not allowed."));
    }
  },
  credentials: true, // Cookies aur Authorization headers ke liye zaroori hai
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Request-ID",
    "X-Tenant-ID",
    "Accept",
  ],
  maxAge: 600, // Preflight request cache (10 minutes)
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ limit: "16kb", extended: true }));

// Cookie parser
app.use(cookieParser());

// NoSQL injection protection — sanitize req.body, req.query, req.params
// NoSQL injection protection — sanitize req.body, req.query, req.params
// CUSTOM MIDDLEWARE: Compatible with Express 5 (req.query is a getter)
app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  if (req.query) {
    const sanitizedQuery = mongoSanitize.sanitize(req.query);
    if (sanitizedQuery !== req.query) {
      for (const key in req.query) {
        delete req.query[key];
      }
      Object.assign(req.query, sanitizedQuery);
    }
  }
  next();
});

// PERFORMANCE OPTIMIZATION MIDDLEWARES
// Deduplication for write operations (prevents double submissions)
app.use(deduplicationMiddleware);
// Note: Read caching is handled at the service layer (utils/cache.js)
// using targeted keys with explicit invalidation on mutations.

// Import routes
import studentRouter from "./routes/student.routes.js";
import studentAuthRouter from "./routes/studentAuth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import chatRouter from "./routes/chat.routes.js";
import studentChatRouter from "./routes/studentChat.routes.js";
import announcementRouter from "./routes/announcement.routes.js";
import studentAnnouncementRouter from "./routes/studentAnnouncement.routes.js";
import slotRouter from "./routes/slot.routes.js";
import feeRouter from "./routes/fee.routes.js";
import reminderRouter from "./routes/reminder.routes.js";
import libraryRouter from "./routes/library.routes.js";
import expenseRouter from "./routes/expense.routes.js";
import attendanceRouter from "./routes/attendance.routes.js";

// Register routes
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/student-auth", studentAuthRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/student-chat", studentChatRouter);
app.use("/api/v1/announcements", announcementRouter);
app.use("/api/v1/student-announcements", studentAnnouncementRouter);
app.use("/api/v1/slots", slotRouter);
app.use("/api/v1/fees", feeRouter);
app.use("/api/v1/reminders", reminderRouter);
app.use("/api/v1/library", libraryRouter);
app.use("/api/v1/expenses", expenseRouter);
app.use("/api/v1/attendance", attendanceRouter);

// Health check - minimal info
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date(),
  });
});

// System info endpoint - protected in production
app.get("/system/info", (req, res) => {
  // Protect this endpoint in production
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }
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

// ✅ Memory & Heap monitoring endpoint
app.get("/admin/memory-stats", (req, res) => {
  // Protected in production
  if (process.env.NODE_ENV === "production" && !req.headers["x-admin-key"]) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  res.json({
    success: true,
    data: heapSafetyGuard.getDashboardStats(),
    timestamp: new Date(),
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
