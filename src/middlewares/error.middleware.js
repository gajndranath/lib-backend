import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  // Ensure next exists before using it
  if (typeof next !== "function") {
    console.error("❌ Invalid middleware chain - next is not a function");
    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal server error",
      errors: [],
    });
  }

  let error = { ...err };
  error.message = err.message;

  // Handle Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = {
      statusCode: 400,
      message,
    };
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    error = {
      statusCode: 400,
      message: `${field} already exists`,
    };
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    error = {
      statusCode: 401,
      message: "Invalid token",
    };
  }

  if (err.name === "TokenExpiredError") {
    error = {
      statusCode: 401,
      message: "Token expired",
    };
  }

  // Handle custom ApiError
  if (err.statusCode && err.message) {
    error = {
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors || [],
    };
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: error.errors || [],
  });
};

export default errorHandler;
