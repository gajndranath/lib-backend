import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  savePushSubscription,
  sendTestNotification,
  removePushSubscription,
} from "../controllers/notification.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Save push subscription (web or FCM)
router.route("/subscribe").post(savePushSubscription);

// Remove subscription
router.route("/unsubscribe").post(removePushSubscription);

// Send test notification
router.route("/test").post(sendTestNotification);

// Get VAPID public key for web push
router.route("/vapid-public-key").get((req, res) => {
  res.send(process.env.PUBLIC_VAPID_KEY);
});

// Get notification history
router.route("/history").get(async (req, res) => {
  // In production, you'd fetch from a Notification model
  const notifications = [
    {
      id: 1,
      title: "Welcome",
      body: "Welcome to Library Management System",
      timestamp: new Date(),
      read: true,
    },
  ];

  res.json({ success: true, data: notifications });
});

export default router;
