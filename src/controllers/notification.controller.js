import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import NotificationService from "../services/notification.service.js";
import { getVapidPublicKey } from "../config/webpush.config.js";

// Save push subscription (web or FCM)
export const savePushSubscription = asyncHandler(async (req, res) => {
  const { subscription, type = "web", deviceInfo = {} } = req.body;
  const adminId = req.admin._id;

  if (!subscription) {
    throw new ApiError(400, "Subscription is required");
  }

  const Admin = (await import("../models/admin.model.js")).Admin;

  // Update based on type
  if (type === "web") {
    await Admin.findByIdAndUpdate(adminId, {
      webPushSubscription: subscription,
      deviceInfo: deviceInfo,
    });
  } else if (type === "fcm") {
    await Admin.findByIdAndUpdate(adminId, {
      fcmToken: subscription.token || subscription,
      deviceInfo: deviceInfo,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription saved successfully"));
});

// Remove push subscription
export const removePushSubscription = asyncHandler(async (req, res) => {
  const { type = "web" } = req.body;
  const adminId = req.admin._id;

  const Admin = (await import("../models/admin.model.js")).Admin;

  if (type === "web") {
    await Admin.findByIdAndUpdate(adminId, {
      webPushSubscription: null,
    });
  } else if (type === "fcm") {
    await Admin.findByIdAndUpdate(adminId, {
      fcmToken: null,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription removed successfully"));
});

// Test all notification channels
export const testNotificationChannels = asyncHandler(async (req, res) => {
  const results = await NotificationService.testChannels(req.admin._id);

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Test notifications sent"));
});

// Get VAPID public key for web push
export const getVapidKey = asyncHandler(async (req, res) => {
  try {
    const publicKey = getVapidPublicKey();
    return res
      .status(200)
      .json(new ApiResponse(200, { publicKey }, "VAPID public key"));
  } catch (error) {
    throw new ApiError(500, "Web Push not configured");
  }
});

// Get notification history
export const getNotificationHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const Notification = (await import("../models/notification.model.js"))
    .default;

  const query = { userId: req.admin._id };
  if (unreadOnly === "true") {
    query.read = false;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Notification.countDocuments(query),
  ]);

  const unreadCount = await Notification.getUnreadCount(req.admin._id);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        unreadCount,
      },
      "Notification history fetched"
    )
  );
});

// Mark notification as read
export const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const Notification = (await import("../models/notification.model.js"))
    .default;

  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  if (notification.userId.toString() !== req.admin._id.toString()) {
    throw new ApiError(403, "Not authorized to update this notification");
  }

  await notification.markAsRead();

  return res
    .status(200)
    .json(new ApiResponse(200, notification, "Notification marked as read"));
});

// Mark all notifications as read
export const markAllAsRead = asyncHandler(async (req, res) => {
  const Notification = (await import("../models/notification.model.js"))
    .default;

  await Notification.updateMany(
    { userId: req.admin._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );

  const unreadCount = await Notification.getUnreadCount(req.admin._id);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { unreadCount }, "All notifications marked as read")
    );
});

// Get notification preferences
export const getNotificationPreferences = asyncHandler(async (req, res) => {
  const Admin = (await import("../models/admin.model.js")).Admin;

  const admin = await Admin.findById(req.admin._id).select(
    "notificationPreferences"
  );

  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        admin.notificationPreferences,
        "Notification preferences fetched"
      )
    );
});

// Update notification preferences
export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  const Admin = (await import("../models/admin.model.js")).Admin;

  const admin = await Admin.findByIdAndUpdate(
    req.admin._id,
    { notificationPreferences: preferences },
    { new: true }
  ).select("notificationPreferences");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        admin.notificationPreferences,
        "Notification preferences updated"
      )
    );
});
