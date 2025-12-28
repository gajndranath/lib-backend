import admin from "firebase-admin";
import nodemailer from "nodemailer";
import webpush from "web-push";
import { ApiError } from "../utils/ApiError.js";

// Firebase Initialization
let firebaseInitialized = false;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log("✅ Firebase initialized successfully");
  } catch (error) {
    console.warn("⚠️ Firebase initialization failed:", error.message);
  }
}

// Web Push Configuration
if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT || "mailto:admin@library.com",
    process.env.PUBLIC_VAPID_KEY,
    process.env.PRIVATE_VAPID_KEY
  );
}

class NotificationService {
  // Web Push Notification
  static async sendWebPush(subscription, payload) {
    try {
      if (!subscription || !subscription.endpoint) {
        throw new Error("Invalid subscription");
      }

      const notificationPayload = {
        title: payload.title || "Notification",
        body: payload.body || "",
        icon: payload.icon || "/icons/icon-192x192.png",
        badge: payload.badge || "/icons/badge-72x72.png",
        data: payload.data || {},
        actions: payload.actions || [],
        vibrate: payload.vibrate || [200, 100, 200],
        requireInteraction: payload.requireInteraction || false,
        tag: payload.tag || "notification",
        renotify: payload.renotify || true,
        timestamp: payload.timestamp || Date.now(),
      };

      await webpush.sendNotification(
        subscription,
        JSON.stringify(notificationPayload)
      );

      console.log("✅ Web Push sent successfully");
      return true;
    } catch (error) {
      console.error("❌ Web Push Error:", error.message);

      if (error.statusCode === 410) {
        throw new ApiError(410, "Push subscription expired");
      }
      return false;
    }
  }

  // Firebase Cloud Messaging
  static async sendPushNotification(token, title, body, data = {}) {
    if (!firebaseInitialized) {
      console.warn("⚠️ Firebase not initialized, skipping FCM notification");
      return false;
    }

    const message = {
      notification: { title, body },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        channelId: "library_alerts",
      },
      token: token,
      android: {
        priority: "high",
        notification: {
          channelId: "library_alerts",
          sound: "default",
          vibrateTimingsMillis: [0, 500, 250, 500],
          priority: "max",
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          icon: "/icons/icon-192x192.png",
          badge: "/icons/badge-72x72.png",
          actions: [
            {
              action: "view",
              title: "View Details",
            },
          ],
        },
        fcmOptions: {
          link: process.env.FRONTEND_URL || "https://library.com",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      console.log("✅ FCM Notification sent:", response);
      return response;
    } catch (error) {
      console.error("❌ Firebase Notification Error:", error.message);

      // Handle specific FCM errors
      if (error.code === "messaging/registration-token-not-registered") {
        console.log("FCM token no longer valid, should be removed");
        return false;
      }
      return false;
    }
  }

  // Email Notification
  static async sendEmail(to, subject, text, html) {
    if (!process.env.SMTP_HOST) {
      console.warn("⚠️ SMTP not configured, skipping email");
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      const mailOptions = {
        from: `"Library Manager" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
      };

      if (html) {
        mailOptions.html = html;
      } else {
        mailOptions.html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">${subject}</h2>
            <div style="margin: 20px 0; line-height: 1.6;">
              ${text.replace(/\n/g, "<br>")}
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <div style="text-align: center; color: #666; font-size: 12px;">
              <p>Library Management System</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        `;
      }

      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to}`);
      return true;
    } catch (error) {
      console.error("❌ Email Error:", error.message);
      return false;
    }
  }

  // Send all types of notifications
  static async sendMultiChannelNotification({
    email,
    fcmToken,
    webPushSubscription,
    title,
    body,
    data = {},
  }) {
    const results = {
      email: false,
      push: false,
      webPush: false,
    };

    // Send email
    if (email) {
      results.email = await this.sendEmail(email, title, body);
    }

    // Send FCM push
    if (fcmToken && firebaseInitialized) {
      results.push = await this.sendPushNotification(
        fcmToken,
        title,
        body,
        data
      );
    }

    // Send Web Push
    if (webPushSubscription) {
      try {
        results.webPush = await this.sendWebPush(webPushSubscription, {
          title,
          body,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/badge-72x72.png",
          data,
          actions: [
            {
              action: "view",
              title: "View Dashboard",
            },
          ],
        });
      } catch (error) {
        if (error.statusCode === 410) {
          results.webPush = "expired";
        }
      }
    }

    return results;
  }

  // Send batch notifications
  static async sendBatchNotifications(subscriptions, payload) {
    const promises = subscriptions.map((subscription) =>
      this.sendWebPush(subscription, payload).catch((error) => {
        console.error(
          `Failed to send to ${subscription.endpoint}:`,
          error.message
        );
        return { success: false, error };
      })
    );

    const results = await Promise.allSettled(promises);

    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value === true
    ).length;
    const failed = results.length - successful;

    return {
      total: results.length,
      successful,
      failed,
      results,
    };
  }
}

export default NotificationService;
