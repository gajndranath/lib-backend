import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
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

// Apply authentication to all routes
router.use(verifyJWT);

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
