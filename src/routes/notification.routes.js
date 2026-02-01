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
} from "../controllers/notification.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Push subscription management
router.route("/subscribe").post(savePushSubscription);
router.route("/unsubscribe").post(removePushSubscription);

// VAPID key for web push
router.route("/vapid-key").get(getVapidKey);

// Notification preferences
router
  .route("/preferences")
  .get(getNotificationPreferences)
  .put(updateNotificationPreferences);

// Notification history
router.route("/history").get(getNotificationHistory);

// Mark notifications
router.route("/read/:notificationId").patch(markAsRead);
router.route("/read-all").patch(markAllAsRead);

// Test notifications
router.route("/test").post(testNotificationChannels);

export default router;
