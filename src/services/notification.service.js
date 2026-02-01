import { sendFCMNotification } from "../config/firebase.config.js";
import { sendEmail, sendTemplateEmail } from "../config/email.config.js";
import {
  sendWebPushNotification,
  isWebPushInitialized,
} from "../config/webpush.config.js";
import { ApiError } from "../utils/ApiError.js";

class NotificationService {
  /**
   * Send payment reminder to student
   */
  static async sendPaymentReminder(studentData, feeData) {
    const { name, email, phone } = studentData;
    const { amount, month, year } = feeData;

    const monthYear = `${this.getMonthName(month)} ${year}`;

    // Prepare notification data
    const notificationData = {
      studentId: studentData._id,
      studentName: name,
      email: email,
      amount: amount,
      monthYear: monthYear,
      month: month,
      year: year,
    };

    const results = {
      email: null,
      sms: null,
      push: null,
      webPush: null,
    };

    // Send email
    if (email) {
      results.email = await sendTemplateEmail(email, "PAYMENT_REMINDER", {
        studentName: name,
        amount: amount,
        monthYear: monthYear,
      });
    }

    // Send SMS (if phone exists and SMS is configured)
    if (phone && process.env.SMS_API_KEY) {
      results.sms = await this.sendSMS(
        phone,
        `Dear ${name}, your payment of ₹${amount} for ${monthYear} is pending. Library Management System`,
      );
    }

    // Send in-app notification (via socket)
    results.inApp = await this.sendInAppNotification({
      userId: studentData._id,
      title: `Payment Reminder - ${monthYear}`,
      message: `Your payment of ₹${amount} for ${monthYear} is pending`,
      type: "PAYMENT_REMINDER",
      data: notificationData,
    });

    return results;
  }

  /**
   * Send payment confirmation
   */
  static async sendPaymentConfirmation(studentData, paymentData) {
    const { name, email, phone } = studentData;
    const { amount, month, year, receiptNumber, paymentDate } = paymentData;

    const monthYear = `${this.getMonthName(month)} ${year}`;

    const results = {
      email: null,
      sms: null,
      push: null,
    };

    // Send email
    if (email) {
      results.email = await sendTemplateEmail(email, "PAYMENT_CONFIRMATION", {
        studentName: name,
        amount: amount,
        monthYear: monthYear,
        receiptNumber: receiptNumber,
        paymentDate: paymentDate.toLocaleDateString("en-IN"),
      });
    }

    // Send SMS
    if (phone && process.env.SMS_API_KEY) {
      results.sms = await this.sendSMS(
        phone,
        `Dear ${name}, payment of ₹${amount} for ${monthYear} received. Receipt: ${receiptNumber}. Library Management System`,
      );
    }

    // Send in-app notification
    results.inApp = await this.sendInAppNotification({
      userId: studentData._id,
      title: `Payment Confirmation - ${monthYear}`,
      message: `Payment of ₹${amount} received successfully`,
      type: "PAYMENT_CONFIRMATION",
      data: {
        studentId: studentData._id,
        amount,
        monthYear,
        receiptNumber,
        paymentDate,
      },
    });

    return results;
  }

  /**
   * Send overdue alert
   */
  static async sendOverdueAlert(studentData, feeData) {
    const { name, email, phone } = studentData;
    const { amount, month, year } = feeData;

    const monthYear = `${this.getMonthName(month)} ${year}`;

    const results = {
      email: null,
      sms: null,
      push: null,
    };

    // Send email
    if (email) {
      results.email = await sendTemplateEmail(email, "OVERDUE_ALERT", {
        studentName: name,
        amount: amount,
        monthYear: monthYear,
      });
    }

    // Send SMS
    if (phone && process.env.SMS_API_KEY) {
      results.sms = await this.sendSMS(
        phone,
        `URGENT: Payment of ₹${amount} for ${monthYear} is OVERDUE. Please clear dues immediately. Library Management System`,
      );
    }

    // Send in-app notification
    results.inApp = await this.sendInAppNotification({
      userId: studentData._id,
      title: `🚨 Overdue Payment - ${monthYear}`,
      message: `Payment of ₹${amount} is overdue. Please clear dues immediately.`,
      type: "OVERDUE_ALERT",
      data: {
        studentId: studentData._id,
        amount,
        monthYear,
        isOverdue: true,
      },
    });

    return results;
  }

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
   */
  static async sendSMS(phoneNumber, message) {
    try {
      // This is a placeholder for SMS integration
      // In production, integrate with SMS gateway like MSG91, Twilio, etc.

      if (!process.env.SMS_API_KEY) {
        return { success: false, error: "SMS service not configured" };
      }

      console.log(`📱 SMS would be sent to ${phoneNumber}: ${message}`);

      // Example integration (using fetch)
      /*
      const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': process.env.SMS_API_KEY,
        },
        body: JSON.stringify({
          sender: process.env.SMS_SENDER_ID || 'LIBRARY',
          route: '4',
          country: '91',
          sms: [
            {
              message: message,
              to: [phoneNumber],
            },
          ],
        }),
      });

      const result = await response.json();
      return { success: result.type === 'success', data: result };
      */

      return { success: true, simulated: true, message: "SMS would be sent" };
    } catch (error) {
      console.error("SMS sending error:", error);
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

      const savedNotification = await Notification.create({
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data,
        read: false,
      });

      // Emit via socket (if socket is available)
      const io = global.io;
      if (io) {
        io.to(`user_${notification.userId}`).emit("notification", {
          ...savedNotification.toObject(),
          timestamp: new Date(),
        });
      }

      return { success: true, notificationId: savedNotification._id };
    } catch (error) {
      console.error("In-app notification error:", error);
      return { success: false, error: error.message };
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
   * Used by reminder service to send payment/due reminders
   */
  static async sendMultiChannelNotification(notificationData) {
    try {
      const {
        studentId,
        studentName,
        email,
        title,
        message,
        type,
        metadata = {},
      } = notificationData;

      // Get student's notification preferences (if stored separately)
      // For now, we'll assume basic email/push preferences
      const results = {
        email: null,
        sms: null,
        push: null,
        webPush: null,
        inApp: null,
      };

      // Send Email
      if (email) {
        try {
          results.email = await sendEmail(email, title, message);
          console.log(`✅ Email sent to ${email} for reminder: ${title}`);
        } catch (error) {
          console.error(`❌ Email failed for ${email}:`, error.message);
          results.email = { success: false, error: error.message };
        }
      }

      // Send SMS (if phone available and SMS configured)
      if (metadata.phone && process.env.SMS_API_KEY) {
        try {
          const smsMessage = `Dear ${studentName}, ${message}. Library Management System`;
          results.sms = await this.sendSMS(metadata.phone, smsMessage);
          console.log(
            `✅ SMS sent to ${metadata.phone} for reminder: ${title}`,
          );
        } catch (error) {
          console.error(`❌ SMS failed for ${metadata.phone}:`, error.message);
          results.sms = { success: false, error: error.message };
        }
      }

      // Get student's push subscription for web push (if available)
      if (metadata.webPushSubscription) {
        try {
          results.webPush = await this.sendWebPush(
            metadata.webPushSubscription,
            {
              title: title,
              body: message,
              data: {
                type: type,
                studentId: studentId.toString(),
                metadata: metadata,
              },
            },
          );
          console.log(
            `✅ Web Push sent to student ${studentId} for reminder: ${title}`,
          );
        } catch (error) {
          console.error(
            `❌ Web Push failed for student ${studentId}:`,
            error.message,
          );
          results.webPush = { success: false, error: error.message };
        }
      }

      // Send FCM push (if token available)
      if (metadata.fcmToken) {
        try {
          results.push = await this.sendFCMPush(
            metadata.fcmToken,
            {
              title: title,
              body: message,
            },
            {
              type: type,
              studentId: studentId.toString(),
              month: metadata.month,
              year: metadata.year,
            },
          );
          console.log(
            `✅ FCM Push sent to student ${studentId} for reminder: ${title}`,
          );
        } catch (error) {
          console.error(
            `❌ FCM Push failed for student ${studentId}:`,
            error.message,
          );
          results.push = { success: false, error: error.message };
        }
      }

      // Send In-App Notification (always send)
      try {
        results.inApp = await this.sendInAppNotification({
          userId: studentId,
          title: title,
          message: message,
          type: type,
          data: {
            studentId: studentId.toString(),
            ...metadata,
          },
        });
        console.log(
          `✅ In-App notification created for student ${studentId}: ${title}`,
        );
      } catch (error) {
        console.error(
          `❌ In-App notification failed for ${studentId}:`,
          error.message,
        );
        results.inApp = { success: false, error: error.message };
      }

      return results;
    } catch (error) {
      console.error("sendMultiChannelNotification error:", error);
      throw error;
    }
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
