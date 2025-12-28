import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";

export const savePushSubscription = asyncHandler(async (req, res) => {
  const { subscription, type = "web" } = req.body;
  const adminId = req.admin._id;

  if (!subscription) {
    throw new ApiError(400, "Subscription is required");
  }

  // Store subscription based on type
  const updateField = type === "web" ? "webPushSubscription" : "fcmToken";

  const admin = await Admin.findByIdAndUpdate(
    adminId,
    { [updateField]: subscription },
    { new: true }
  ).select("-password");

  // Also store in memory for socket connections
  const adminTokens = req.app.get("adminTokens");
  if (!adminTokens.has(adminId.toString())) {
    adminTokens.set(adminId.toString(), []);
  }

  const tokens = adminTokens.get(adminId.toString());
  tokens.push({ subscription, type, timestamp: new Date() });

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Subscription saved successfully"));
});

export const sendTestNotification = asyncHandler(async (req, res) => {
  const { message = "Test notification" } = req.body;
  const adminId = req.admin._id;

  const admin = await Admin.findById(adminId);
  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  const NotificationService = (
    await import("../services/notification.service.js")
  ).default;

  // Send to all available channels
  const results = await NotificationService.sendMultiChannelNotification({
    email: admin.email,
    fcmToken: admin.fcmToken,
    webPushSubscription: admin.webPushSubscription,
    title: "Test Notification",
    body: message,
    data: {
      url: "/dashboard",
      timestamp: new Date().toISOString(),
      type: "test",
    },
  });

  // Also send via socket for real-time dashboard
  const io = req.app.get("io");
  io.to(`admin_${adminId}`).emit("test_notification", {
    title: "Test Notification",
    body: message,
    timestamp: new Date(),
  });

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Test notification sent"));
});

export const removePushSubscription = asyncHandler(async (req, res) => {
  const { type = "web" } = req.body;
  const adminId = req.admin._id;

  const updateField = type === "web" ? "webPushSubscription" : "fcmToken";

  const admin = await Admin.findByIdAndUpdate(
    adminId,
    { [updateField]: null },
    { new: true }
  ).select("-password");

  // Remove from memory
  const adminTokens = req.app.get("adminTokens");
  adminTokens.delete(adminId.toString());

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Subscription removed successfully"));
});
