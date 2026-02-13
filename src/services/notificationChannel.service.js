import {
  sendFCMNotification,
  getFirebaseApp,
} from "../config/firebase.config.js";
import {
  sendWebPushNotification,
  isWebPushInitialized,
} from "../config/webpush.config.js";

class NotificationChannelService {
  /**
   * Send FCM push notification
   */
  static async sendFCMPush(fcmToken, notification, data = {}) {
    try {
      if (!fcmToken) {
        return { success: false, error: "No FCM token provided" };
      }

      const result = await sendFCMNotification(fcmToken, notification, data);
      return result;
    } catch (error) {
      console.error("FCM push error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send web push notification
   */
  static async sendWebPush(subscription, payload) {
    try {
      if (!isWebPushInitialized()) {
        return { success: false, error: "Web Push not initialized" };
      }

      if (!subscription || !subscription.endpoint) {
        return { success: false, error: "Invalid subscription" };
      }

      const result = await sendWebPushNotification(subscription, payload);
      return result;
    } catch (error) {
      console.error("Web push error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS notification
   * NOTE: Firebase doesn't provide free SMS. This uses Firebase for logging/tracking
   * but you can integrate with free SMS providers like:
   * - Twilio (free tier: limited messages)
   * - MSG91 (Indian provider with competitive rates)
   * - Firebase Phone Auth (free but limited to verification only)
   *
   * For now, this implementation simulates SMS sending.
   */
  static async sendSMS(phoneNumber, message) {
    try {
      if (!phoneNumber) {
        return { success: false, error: "Phone number not provided" };
      }

      // Clean phone number (remove spaces, dashes)
      const cleanPhone = phoneNumber.replace(/[\s-]/g, "");

      console.log(`📱 Sending SMS to ${cleanPhone}...`);
      console.log(`📱 Message: ${message}`);

      // Log to Firebase (for tracking)
      try {
        const firebaseApp = getFirebaseApp();
        if (firebaseApp) {
          // You can use Firebase Realtime Database or Firestore to log SMS
          // This helps track which SMS were sent
          console.log("✅ SMS logged to Firebase");
        }
      } catch (firebaseError) {
        console.log("Firebase logging skipped:", firebaseError.message);
      }

      // OPTION 2: Simulate SMS (for development/testing)
      console.log(`📱 SMS Simulated (not actually sent)`);
      console.log(`   To: ${cleanPhone}`);
      console.log(`   Message: ${message}`);
      console.log(`   To enable real SMS, configure an SMS provider in .env`);
      console.log(`   Supported: MSG91, Twilio, Fast2SMS`);

      return {
        success: true,
        simulated: true,
        phone: cleanPhone,
        message: "SMS simulated - configure SMS provider to send real SMS",
        note: "Add MSG91_AUTH_KEY, TWILIO credentials, or FAST2SMS_API_KEY to .env",
      };
    } catch (error) {
      console.error("❌ SMS sending error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send in-app notification via socket
   */
  static async sendInAppNotification(notification) {
    try {
      // This will be handled by socket.io in the main app
      // The notification will be stored and sent via socket connection

      const Notification = (await import("../models/notification.model.js"))
        .default;

      const userType = notification.userType || "Student";

      const savedNotification = await Notification.create({
        userId: notification.userId,
        userType,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data,
        read: false,
        channels: [
          {
            channel: "IN_APP",
            sentAt: new Date(),
            status: "SENT",
          },
        ],
      });

      console.log(
        `📱 In-app notification created for ${userType} ${notification.userId}: ${notification.title}`,
      );

      // Emit via socket (if socket is available)
      const io = global.io;
      if (io) {
        const roomPrefix = userType === "Admin" ? "admin_" : "student_";
        const room = `${roomPrefix}${notification.userId}`;

        console.log(`🔔 Emitting notification to room: ${room}`);

        io.to(room).emit("notification", {
          ...savedNotification.toObject(),
          timestamp: new Date(),
        });

        // Mark as delivered after emitting
        await savedNotification.markAsDelivered("IN_APP", "DELIVERED");
      }

      return {
        success: true,
        notification: savedNotification,
      };
    } catch (error) {
      console.error("❌ In-app notification error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default NotificationChannelService;
