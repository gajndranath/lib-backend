import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Winston Logger Configuration
 * Provides structured logging with different levels and transports
 * Usage: logger.info("message"), logger.error("error"), etc.
 */

const logDir = path.join(__dirname, "../../logs");

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Define custom log levels with colors
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    http: 4,
    debug: 5,
  },
  colors: {
    fatal: "red",
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    debug: "blue",
  },
};

// Add colors to Winston
winston.addColors(customLevels.colors);

// Create logger
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: logFormat,
  defaultMeta: { service: "library-management-system" },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.uncolorize(),
    }),

    // File transport for error logs only
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.uncolorize(),
    }),

    // File transport for http logs
    new winston.transports.File({
      filename: path.join(logDir, "http.log"),
      level: "http",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.uncolorize(),
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, service, ...meta }) => {
            const metaStr =
              Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : "";
            return `[${timestamp}] ${level}: ${message} ${metaStr}`;
          },
        ),
      ),
    }),
  );
}

/**
 * HTTP Request Logger Middleware
 * Logs all incoming HTTP requests with method, URL, status code, and response time
 */
export const httpLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  logger.http(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Capture response
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(
      `${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`,
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      },
    );
  });

  next();
};

/**
 * Helper function to log service operations
 */
export const logServiceOperation = (serviceName, operation, level = "info") => {
  return (message, metadata = {}) => {
    logger[level](`[${serviceName}] ${operation}: ${message}`, {
      service: serviceName,
      operation,
      ...metadata,
    });
  };
};

/**
 * Helper function to log database operations
 */
export const logDatabaseOperation = (model, operation) => {
  return (message, metadata = {}) => {
    logger.debug(`[DB:${model}] ${operation}: ${message}`, {
      model,
      operation,
      ...metadata,
    });
  };
};

/**
 * Helper function to log errors with context
 */
export const logError = (error, context = {}) => {
  logger.error(error.message || "Unknown error", {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      status: error.status,
    },
    ...context,
  });
};

export default logger;
