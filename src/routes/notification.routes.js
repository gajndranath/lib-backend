import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import {
  savePushSubscription,
  removePushSubscription,
  testNotificationChannels,
  getVapidKey,
  getNotificationHistory,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendDirectNotification,
} from "../controllers/notification.controller.js";
import {
  notificationLimiter,
  apiLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

import jwt from "jsonwebtoken";
import { Student } from "../models/student.model.js";
import { Admin } from "../models/admin.model.js";

// Multi-role authentication: tries Student then Admin
const verifyAnyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "No authentication token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    // 1. Try Student
    if (decoded.userType === "Student") {
       const student = await Student.findById(decoded._id).select("-password -otpHash");
       if (student) {
         req.student = student;
         return next();
       }
    }
    
    // 2. Try Admin
    const admin = await Admin.findById(decoded._id).select("-password");
    if (admin) {
      if (!admin.isActive) throw new ApiError(403, "Admin account inactive");
      req.admin = admin;
      return next();
    }

    throw new ApiError(401, "Invalid user session");
  } catch (error) {
    throw new ApiError(401, error.message || "Authentication failed");
  }
});

router.use(verifyAnyJWT);

router.use(resolveTenant);

// High-frequency notification operations - use notification limiter
router.route("/history").get(notificationLimiter, getNotificationHistory);
router.route("/read/:notificationId").patch(notificationLimiter, markAsRead);
router.route("/read-all").patch(notificationLimiter, markAllAsRead);

// Standard rate limiting for preference management
router
  .route("/preferences")
  .get(apiLimiter, getNotificationPreferences)
  .put(apiLimiter, updateNotificationPreferences);

// Push subscription management - standard rate limit
router.route("/subscribe").post(apiLimiter, savePushSubscription);
router.route("/unsubscribe").post(apiLimiter, removePushSubscription);

// VAPID key for web push - cached, safe to have high limit
router.route("/vapid-key").get(getVapidKey);

// Admin operations - standard rate limit
router.route("/test").post(apiLimiter, testNotificationChannels);
router.route("/send-to-student").post(apiLimiter, sendDirectNotification);

export default router;
