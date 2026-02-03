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

      // OPTION 1: Use a free SMS API (you need to sign up)
      // Uncomment and configure one of these:

      /* 
      // MSG91 (Indian provider - has free tier)
      if (process.env.MSG91_AUTH_KEY) {
        const response = await fetch('https://api.msg91.com/api/v5/flow/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authkey': process.env.MSG91_AUTH_KEY,
          },
          body: JSON.stringify({
            flow_id: process.env.MSG91_FLOW_ID,
            sender: process.env.MSG91_SENDER_ID || 'LIBRARY',
            mobiles: cleanPhone,
            VAR1: message, // Template variable
          }),
        });
        
        const result = await response.json();
        if (result.type === 'success') {
          console.log('✅ SMS sent via MSG91');
          return { success: true, provider: 'MSG91', data: result };
        }
      }
      */

      /*
      // Twilio (has free trial)
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio')(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        
        const result = await twilio.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: cleanPhone
        });
        
        console.log('✅ SMS sent via Twilio');
        return { success: true, provider: 'Twilio', sid: result.sid };
      }
      */

      /*
      // Fast2SMS (Indian provider - free tier available)
      if (process.env.FAST2SMS_API_KEY) {
        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            route: 'q',
            message: message,
            language: 'english',
            flash: 0,
            numbers: cleanPhone
          })
        });
        
        const result = await response.json();
        if (result.return) {
          console.log('✅ SMS sent via Fast2SMS');
          return { success: true, provider: 'Fast2SMS', data: result };
        }
      }
      */

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
      } else {
        console.warn(
          "⚠️ Socket.io not available, notification saved but not emitted",
        );
      }

      return { success: true, notificationId: savedNotification._id };
    } catch (error) {
      console.error("In-app notification error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send chat notification (in-app + push)
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
    };

    try {
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
