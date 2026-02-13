import { sendEmail } from "../config/email.config.js";
import { ApiError } from "../utils/ApiError.js";
import NotificationChannelService from "./notificationChannel.service.js";
import NotificationTemplateService from "./notificationTemplate.service.js";

class NotificationService {
  /**
   * Send payment reminder to student
   * Delegates to template service
   */
  static async sendPaymentReminder(studentData, feeData) {
    return NotificationTemplateService.sendPaymentReminder(
      studentData,
      feeData,
    );
  }

  /**
   * Send payment confirmation
   * Delegates to template service
   */
  static async sendPaymentConfirmation(studentData, paymentData) {
    return NotificationTemplateService.sendPaymentConfirmation(
      studentData,
      paymentData,
    );
  }

  /**
   * Send FCM push notification
   * Delegates to channel service
   */
  static async sendFCMPush(fcmToken, notification, data = {}) {
    return NotificationChannelService.sendFCMPush(fcmToken, notification, data);
  }

  /**
   * Send web push notification
   * Delegates to channel service
   */
  static async sendWebPush(subscription, payload) {
    return NotificationChannelService.sendWebPush(subscription, payload);
  }

  /**
   * Send overdue alert
   * Delegates to template service
   */
  static async sendOverdueAlert(studentData, feeData) {
    return NotificationTemplateService.sendOverdueAlert(studentData, feeData);
  }

  /**
   * Send SMS notification
   * Delegates to channel service
   */
  static async sendSMS(phoneNumber, message) {
    return NotificationChannelService.sendSMS(phoneNumber, message);
  }

  /**
   * Send in-app notification via socket
   * Delegates to channel service
   */
  static async sendInAppNotification(notification) {
    return NotificationChannelService.sendInAppNotification(notification);
  }

  /**
   * Send chat notification (in-app + push)
   * Skips notification if user is actively viewing the chat
   */
  static async sendChatNotification({
    recipientId,
    recipientType,
    senderName,
    conversationId,
  }) {
    const title = `New message from ${senderName}`;
    const message = "You have a new encrypted message";

    const results = {
      inApp: null,
      webPush: null,
      push: null,
      skipped: false,
    };

    try {
      // ✅ Check if user is actively viewing this chat
      const redisClient = (await import("../config/redis.js")).getRedisClient();
      const activeKey = `active_chat:${recipientType}:${recipientId}`;
      const activeChat = await redisClient.get(activeKey).catch(() => null);

      if (activeChat === conversationId.toString()) {
        // User is actively viewing this chat, skip notification
        results.skipped = true;
        return results;
      }

      const Model =
        recipientType === "Admin"
          ? (await import("../models/admin.model.js")).Admin
          : (await import("../models/student.model.js")).Student;

      const recipient = await Model.findById(recipientId);

      results.inApp = await this.sendInAppNotification({
        userId: recipientId,
        userType: recipientType,
        title,
        message,
        type: "CHAT_MESSAGE",
        data: { conversationId, senderName },
      });

      if (recipient?.webPushSubscription) {
        results.webPush = await this.sendWebPush(
          recipient.webPushSubscription,
          {
            title,
            body: message,
            data: {
              type: "CHAT_MESSAGE",
              conversationId,
            },
          },
        );
      }

      if (recipient?.fcmToken) {
        results.push = await this.sendFCMPush(
          recipient.fcmToken,
          { title, body: message },
          { type: "CHAT_MESSAGE", conversationId },
        );
      }

      return results;
    } catch (error) {
      console.error("sendChatNotification error:", error);
      return results;
    }
  }

  /**
   * Send announcement notification (in-app + push)
   */
  static async sendAnnouncementNotification({ studentId, title }) {
    const message = "You have a new announcement";
    const results = { inApp: null, webPush: null, push: null };

    try {
      const Student = (await import("../models/student.model.js")).Student;
      const student = await Student.findById(studentId);

      results.inApp = await this.sendInAppNotification({
        userId: studentId,
        userType: "Student",
        title,
        message,
        type: "ANNOUNCEMENT",
        data: { studentId: studentId.toString() },
      });

      if (student?.webPushSubscription) {
        results.webPush = await this.sendWebPush(student.webPushSubscription, {
          title,
          body: message,
          data: { type: "ANNOUNCEMENT" },
        });
      }

      if (student?.fcmToken) {
        results.push = await this.sendFCMPush(
          student.fcmToken,
          { title, body: message },
          { type: "ANNOUNCEMENT" },
        );
      }

      return results;
    } catch (error) {
      console.error("sendAnnouncementNotification error:", error);
      return results;
    }
  }

  /**
   * Send notification to admin
   */
  static async sendAdminNotification(adminId, title, message, type = "SYSTEM") {
    try {
      const Admin = (await import("../models/admin.model.js")).Admin;
      const admin = await Admin.findById(adminId);

      if (!admin) {
        return { success: false, error: "Admin not found" };
      }

      const results = {};

      // Send email
      if (admin.email && admin.notificationPreferences?.email) {
        results.email = await sendEmail(admin.email, title, message);
      }

      // Send FCM push
      if (admin.fcmToken && admin.notificationPreferences?.push) {
        results.push = await this.sendFCMPush(
          admin.fcmToken,
          {
            title: title,
            body: message,
          },
          { type },
        );
      }

      // Send web push
      if (admin.webPushSubscription && admin.notificationPreferences?.push) {
        results.webPush = await this.sendWebPush(admin.webPushSubscription, {
          title: title,
          body: message,
          data: { type },
        });
      }

      // Send in-app notification
      results.inApp = await this.sendInAppNotification({
        userId: adminId,
        userType: "Admin",
        title: title,
        message: message,
        type: type,
        data: { adminId },
      });

      return results;
    } catch (error) {
      console.error("Admin notification error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all admins
   */
  static async broadcastToAdmins(title, message, type = "SYSTEM") {
    try {
      const Admin = (await import("../models/admin.model.js")).Admin;
      const admins = await Admin.find({
        isActive: true,
      });

      const results = await Promise.all(
        admins.map((admin) =>
          this.sendAdminNotification(admin._id, title, message, type).catch(
            (error) => ({
              success: false,
              adminId: admin._id,
              error: error.message,
            }),
          ),
        ),
      );

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        total: results.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      console.error("Broadcast to admins error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper: Get month name
   */
  static getMonthName(monthIndex) {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return months[monthIndex];
  }

  /**
   * Send notification via multiple channels to a student
   * Delegates to template service
   */
  static async sendMultiChannelNotification(notificationData) {
    return NotificationTemplateService.sendMultiChannelNotification(
      notificationData,
    );
  }

  /**
   * Test all notification channels
   */
  static async testChannels(adminId) {
    try {
      const Admin = (await import("../models/admin.model.js")).Admin;
      const admin = await Admin.findById(adminId);

      if (!admin) {
        throw new ApiError(404, "Admin not found");
      }

      const testResults = {
        email: null,
        fcm: null,
        webPush: null,
        sms: null,
        inApp: null,
      };

      const testMessage =
        "This is a test notification from Library Management System";

      // Test email
      if (admin.email) {
        testResults.email = await sendEmail(
          admin.email,
          "Test Notification",
          testMessage,
        );
      }

      // Test FCM
      if (admin.fcmToken) {
        testResults.fcm = await this.sendFCMPush(
          admin.fcmToken,
          {
            title: "Test Notification",
            body: testMessage,
          },
          { type: "TEST" },
        );
      }

      // Test Web Push
      if (admin.webPushSubscription) {
        testResults.webPush = await this.sendWebPush(
          admin.webPushSubscription,
          {
            title: "Test Notification",
            body: testMessage,
            data: { type: "TEST" },
          },
        );
      }

      // Test SMS
      if (admin.phone && process.env.SMS_API_KEY) {
        testResults.sms = await this.sendSMS(admin.phone, testMessage);
      }

      // Test in-app
      testResults.inApp = await this.sendInAppNotification({
        userId: adminId,
        title: "Test Notification",
        message: testMessage,
        type: "TEST",
        data: { test: true },
      });

      return {
        success: true,
        message: "Test notifications sent",
        results: testResults,
      };
    } catch (error) {
      console.error("Test channels error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default NotificationService;
