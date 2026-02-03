import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import errorHandler from "./middlewares/error.middleware.js";
import { cachingMiddleware } from "./middlewares/caching.middleware.js";
import { deduplicationMiddleware } from "./middlewares/deduplication.middleware.js";
import { heapSafetyGuard } from "./utils/heapSafetyGuard.js";

const app = express();

// ✅ Start memory monitoring (every 30 seconds)
setInterval(() => {
  heapSafetyGuard.monitorHeap();
}, 30000);

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
const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [
  "http://localhost:3000",
];
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or server-side requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy violation"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Request-ID",
  ],
  maxAge: 600, // 10 minutes
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ limit: "16kb", extended: true }));

// Cookie parser
app.use(cookieParser());

// PERFORMANCE OPTIMIZATION MIDDLEWARES
// Deduplication for write operations (prevents double submissions)
app.use(deduplicationMiddleware);

// Caching for read operations (reduces database load)
app.use(cachingMiddleware);

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
