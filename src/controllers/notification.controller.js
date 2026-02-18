import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import NotificationService from "../services/notification.service.js";
import { getVapidPublicKey } from "../config/webpush.config.js";

// Save push subscription (web or FCM)
export const savePushSubscription = asyncHandler(async (req, res) => {
  const { subscription, type = "web", deviceInfo = {} } = req.body;
  const userId = req.student?._id || req.admin?._id;
  const userRole = req.student ? "Student" : req.admin ? "Admin" : null;

  if (!subscription) {
    throw new ApiError(400, "Subscription is required");
  }

  if (!userId) {
    throw new ApiError(401, "User not authenticated for subscription");
  }

  if (userRole === "Admin") {
    const Admin = (await import("../models/admin.model.js")).Admin;
    const update = { deviceInfo };
    if (type === "web") update.webPushSubscription = subscription;
    else if (type === "fcm") update.fcmToken = subscription.token || subscription;
    await Admin.findByIdAndUpdate(userId, update);
  } else {
    const Student = (await import("../models/student.model.js")).Student;
    const update = { deviceInfo };
    if (type === "web") update.webPushSubscription = subscription;
    else if (type === "fcm") update.fcmToken = subscription.token || subscription;
    await Student.findByIdAndUpdate(userId, update);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription saved successfully"));
});

// Remove push subscription
export const removePushSubscription = asyncHandler(async (req, res) => {
  const { type = "web" } = req.body;
  const userId = req.student?._id || req.admin?._id;
  const userRole = req.student ? "Student" : "Admin";

  const update = {};
  if (type === "web") update.webPushSubscription = null;
  else if (type === "fcm") update.fcmToken = null;

  if (userRole === "Admin") {
    const Admin = (await import("../models/admin.model.js")).Admin;
    await Admin.findByIdAndUpdate(userId, update);
  } else {
    const Student = (await import("../models/student.model.js")).Student;
    await Student.findByIdAndUpdate(userId, update);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription removed successfully"));
});

// Test all notification channels
export const testNotificationChannels = asyncHandler(async (req, res) => {
  const adminId = req.admin?._id;
  if (!adminId) {
    throw new ApiError(403, "Only admins can test channels");
  }
  const results = await NotificationService.testChannels(adminId);

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

  // Support both student and admin
  const userId = req.student
    ? req.student._id
    : req.admin
      ? req.admin._id
      : undefined;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: user not found" });
  }
  const query = { userId };
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

  const unreadCount = await Notification.getUnreadCount(userId);

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
      "Notification history fetched",
    ),
  );
});

// Mark notification as read
export const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.student?._id || req.admin?._id;

  const Notification = (await import("../models/notification.model.js"))
    .default;

  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  if (String(notification.userId) !== String(userId)) {
    throw new ApiError(403, "Not authorized to update this notification");
  }

  await notification.markAsRead();

  return res
    .status(200)
    .json(new ApiResponse(200, notification, "Notification marked as read"));
});

// Mark all notifications as read
export const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.student?._id || req.admin?._id;

  const Notification = (await import("../models/notification.model.js"))
    .default;

  await Notification.updateMany(
    { userId: userId, read: false },
    { $set: { read: true, readAt: new Date() } },
  );

  const unreadCount = await Notification.getUnreadCount(userId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { unreadCount }, "All notifications marked as read"),
    );
});

// Get notification preferences
export const getNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.student?._id || req.admin?._id;
  const userRole = req.student ? "Student" : "Admin";

  if (userRole === "Admin") {
    const Admin = (await import("../models/admin.model.js")).Admin;
    const admin = await Admin.findById(userId).select("notificationPreferences");
    if (!admin) throw new ApiError(404, "Admin not found");
    return res.status(200).json(new ApiResponse(200, admin.notificationPreferences, "Notification preferences fetched"));
  } else {
    // Students might not have specific preferences yet, return defaults
    return res.status(200).json(new ApiResponse(200, {}, "Default student preferences"));
  }
});

// Update notification preferences
export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;
  const adminId = req.admin?._id;

  if (!adminId) {
    throw new ApiError(403, "Only admins can update preferences");
  }

  const Admin = (await import("../models/admin.model.js")).Admin;

  const admin = await Admin.findByIdAndUpdate(
    adminId,
    { notificationPreferences: preferences },
    { new: true },
  ).select("notificationPreferences");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        admin.notificationPreferences,
        "Notification preferences updated",
      ),
    );
});

// Send direct notification to student
export const sendDirectNotification = asyncHandler(async (req, res) => {
  const { studentId, channel, title, message } = req.body;

  if (!studentId || !channel) {
    throw new ApiError(400, "Student ID and channel are required");
  }

  const Student = (await import("../models/student.model.js")).Student;
  const student = await Student.findById(studentId);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const notificationTitle = title || `Payment Reminder - ${student.name}`;
  const notificationMessage =
    message ||
    `Dear ${student.name}, this is a reminder to pay your pending fee. Please pay at your earliest convenience.`;

  const results = {};

  try {
    const adminId = req.admin?._id;
    if (channel === "all") {
      // Send via all available channels
      const multiChannelResult =
        await NotificationService.sendMultiChannelNotification({
          studentId: student._id,
          studentName: student.name,
          email: student.email,
          title: notificationTitle,
          message: notificationMessage,
          type: "PAYMENT_DUE",
          metadata: {
            phone: student.phone,
            fcmToken: student.fcmToken,
            webPushSubscription: student.webPushSubscription,
            sentBy: userId,
          },
        });
      results.all = multiChannelResult;
    } else if (channel === "email") {
      if (!student.email) {
        throw new ApiError(400, "Student email not available");
      }
      results.email = await NotificationService.sendMultiChannelNotification({
        studentId: student._id,
        studentName: student.name,
        email: student.email,
        title: notificationTitle,
        message: notificationMessage,
        type: "PAYMENT_DUE",
        metadata: {
          phone: null,
          fcmToken: null,
          webPushSubscription: null,
          sentBy: adminId,
        },
      });
    } else if (channel === "sms") {
      if (!student.phone) {
        throw new ApiError(400, "Student phone not available");
      }
      results.sms = await NotificationService.sendSMS(
        student.phone,
        notificationMessage,
      );
    } else if (channel === "push") {
      if (!student.fcmToken) {
        throw new ApiError(400, "Student push token not available");
      }
      results.push = await NotificationService.sendFCMPush(
        student.fcmToken,
        {
          title: notificationTitle,
          body: notificationMessage,
        },
        {
          type: "PAYMENT_DUE",
          studentId: student._id.toString(),
          sentBy: userId?.toString(),
        },
      );
    } else if (channel === "in-app") {
      results.inApp = await NotificationService.sendInAppNotification({
        userId: student._id,
        title: notificationTitle,
        message: notificationMessage,
        type: "PAYMENT_DUE",
        data: {
          studentId: student._id,
          sentBy: adminId,
        },
      });
    } else {
      throw new ApiError(400, "Invalid notification channel");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { results, student: { _id: student._id, name: student.name } },
          "Notification sent successfully",
        ),
      );
  } catch (error) {
    console.error("Error sending direct notification:", error);
    throw new ApiError(500, error.message || "Failed to send notification");
  }
});
