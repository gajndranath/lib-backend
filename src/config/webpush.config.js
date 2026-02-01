import webpush from "web-push";
import { ApiError } from "../utils/ApiError.js";

let webpushInitialized = false;

export const initializeWebPush = () => {
  try {
    if (!process.env.PUBLIC_VAPID_KEY || !process.env.PRIVATE_VAPID_KEY) {
      console.warn(
        "⚠️ VAPID keys not found. Web push notifications will be disabled."
      );
      return false;
    }

    console.log("Initializing Web Push with VAPID keys...");
    console.log(
      "Public Key (first 20 chars):",
      process.env.PUBLIC_VAPID_KEY.substring(0, 20) + "..."
    );

    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT || "mailto:admin@library.com",
      process.env.PUBLIC_VAPID_KEY,
      process.env.PRIVATE_VAPID_KEY
    );

    webpushInitialized = true;
    console.log("✅ Web Push initialized successfully");
    return true;
  } catch (error) {
    console.error("❌ Web Push initialization failed:", error.message);
    return false;
  }
};

export const isWebPushInitialized = () => webpushInitialized;

export const sendWebPushNotification = async (subscription, payload) => {
  if (!webpushInitialized) {
    throw new ApiError(500, "Web Push not initialized");
  }

  try {
    console.log(
      "Sending Web Push to:",
      subscription.endpoint.substring(0, 50) + "..."
    );

    const notificationPayload = JSON.stringify({
      title: payload.title || "Notification",
      body: payload.body || "",
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/icons/badge-72x72.png",
      image: payload.image,
      data: payload.data || {},
      actions: payload.actions || [],
      vibrate: payload.vibrate || [200, 100, 200],
      requireInteraction: payload.requireInteraction || false,
      tag: payload.tag || "notification",
      renotify: payload.renotify || false,
      timestamp: payload.timestamp || Date.now(),
    });

    const result = await webpush.sendNotification(
      subscription,
      notificationPayload
    );
    console.log("✅ Web Push notification sent, status:", result.statusCode);
    return { success: true, status: result.statusCode };
  } catch (error) {
    console.error("❌ Web Push notification error:", error.message);

    // Handle specific errors
    if (error.statusCode === 410) {
      return {
        success: false,
        error: "Subscription expired",
        code: "SUBSCRIPTION_EXPIRED",
      };
    } else if (error.statusCode === 404) {
      return {
        success: false,
        error: "Subscription not found",
        code: "SUBSCRIPTION_NOT_FOUND",
      };
    }

    return { success: false, error: error.message };
  }
};

export const getVapidPublicKey = () => {
  if (!webpushInitialized) {
    throw new ApiError(500, "Web Push not initialized");
  }
  return process.env.PUBLIC_VAPID_KEY;
};
