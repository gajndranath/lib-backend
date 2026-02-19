import { sendEmail, sendTemplateEmail } from "../services/email.service.js";
import NotificationChannelService from "./notificationChannel.service.js";

/**
 * Notification Template Service
 * Handles template-specific notification logic for different use cases:
 * - Payment reminders
 * - Payment confirmations
 * - Overdue alerts
 * - Course reminders
 * - Admin reminders
 * - Broadcast notifications
 */
class NotificationTemplateService {
  /**
   * Send payment reminder to student
   * Template: Payment Reminder
   * Channels: Email + SMS + In-App
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
      results.sms = await NotificationChannelService.sendSMS(
        phone,
        `Dear ${name}, your payment of ₹${amount} for ${monthYear} is pending. Library Management System`,
      );
    }

    // Send in-app notification (via socket)
    results.inApp = await NotificationChannelService.sendInAppNotification({
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
   * Template: Payment Confirmation
   * Channels: Email + SMS + In-App
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
      results.sms = await NotificationChannelService.sendSMS(
        phone,
        `Dear ${name}, payment of ₹${amount} for ${monthYear} received. Receipt: ${receiptNumber}. Library Management System`,
      );
    }

    // Send in-app notification
    results.inApp = await NotificationChannelService.sendInAppNotification({
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
   * Template: Overdue Alert
   * Channels: Email + SMS + In-App
   */
  static async sendOverdueAlert(studentData, feeData) {
    const { name, email, phone } = studentData;
    const { amount, month, year } = feeData;

    const monthYear = `${this.getMonthName(month)} ${year}`;

    const results = {
      email: null,
      sms: null,
      inApp: null,
    };

    if (email) {
      results.email = await sendTemplateEmail(email, "OVERDUE_ALERT", {
        studentName: name,
        amount,
        monthYear,
      });
    }

    if (phone && process.env.SMS_API_KEY) {
      results.sms = await NotificationChannelService.sendSMS(
        phone,
        `Dear ${name}, your payment of ₹${amount} for ${monthYear} is overdue. Please pay soon. Library Management System`,
      );
    }

    results.inApp = await NotificationChannelService.sendInAppNotification({
      userId: studentData._id,
      title: `Overdue Alert - ${monthYear}`,
      message: `Your payment of ₹${amount} for ${monthYear} is overdue`,
      type: "OVERDUE_ALERT",
      data: {
        studentId: studentData._id,
        amount,
        monthYear,
        month,
        year,
        isOverdue: true,
      },
    });

    return results;
  }

  /**
   * Send course reminder to student
   * Template: Course Reminder
   * Channels: Email + In-App
   */
  static async sendCourseReminder(studentId, courseData) {
    const Student = (await import("../models/student.model.js")).Student;
    const student = await Student.findById(studentId);

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    const results = {
      email: null,
      inApp: null,
    };

    // Send email if available
    if (student.email) {
      results.email = await sendEmail(
        student.email,
        `Reminder: ${courseData.courseName}`,
        courseData.message,
      );
    }

    // Send in-app notification
    results.inApp = await NotificationChannelService.sendInAppNotification({
      userId: studentId,
      title: `Course Reminder: ${courseData.courseName}`,
      message: courseData.message,
      type: "COURSE_REMINDER",
      data: {
        studentId: studentId.toString(),
        ...courseData,
      },
    });

    return results;
  }

  /**
   * Send admin reminder
   * Template: Admin Reminder
   * Channels: Email + In-App
   */
  static async sendAdminReminder(adminId, reminderData) {
    const Admin = (await import("../models/admin.model.js")).Admin;
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return { success: false, error: "Admin not found" };
    }

    const results = {
      email: null,
      inApp: null,
    };

    // Send email if available
    if (admin.email) {
      results.email = await sendEmail(
        admin.email,
        reminderData.title,
        reminderData.message,
      );
    }

    // Send in-app notification
    results.inApp = await NotificationChannelService.sendInAppNotification({
      userId: adminId,
      userType: "Admin",
      title: reminderData.title,
      message: reminderData.message,
      type: "ADMIN_REMINDER",
      data: {
        adminId: adminId.toString(),
        ...reminderData,
      },
    });

    return results;
  }

  /**
   * Send broadcast notification to multiple students
   * Template: Broadcast
   * Channels: Email + In-App
   */
  static async sendBroadcastNotification(studentIds, broadcastData) {
    const Student = (await import("../models/student.model.js")).Student;
    const students = await Student.find({ _id: { $in: studentIds } });

    const results = await Promise.all(
      students.map(async (student) => {
        const studentResults = {
          studentId: student._id,
          email: null,
          inApp: null,
        };

        // Send email
        if (student.email) {
          studentResults.email = await sendEmail(
            student.email,
            broadcastData.subject,
            broadcastData.body,
          ).catch((error) => ({
            success: false,
            error: error.message,
          }));
        }

        // Send in-app
        studentResults.inApp =
          await NotificationChannelService.sendInAppNotification({
            userId: student._id,
            title: broadcastData.subject,
            message: broadcastData.body,
            type: "BROADCAST",
            data: {
              studentId: student._id.toString(),
              ...broadcastData,
            },
          }).catch((error) => ({
            success: false,
            error: error.message,
          }));

        return studentResults;
      }),
    );

    const successful = results.filter(
      (r) => r.email?.success !== false && r.inApp?.success !== false,
    ).length;
    const failed = results.length - successful;

    return {
      total: results.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Send multi-channel notification with custom template
   * Used for flexible notifications across different scenarios
   * Channels: Email + SMS + Push + In-App
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
          console.log(`✅ Email sent to ${email} for ${title}`);
        } catch (error) {
          console.error(`❌ Email failed for ${email}:`, error.message);
          results.email = { success: false, error: error.message };
        }
      }

      // Send SMS (if phone available and SMS configured)
      if (metadata.phone && process.env.SMS_API_KEY) {
        try {
          const smsMessage = `Dear ${studentName}, ${message}. Library Management System`;
          results.sms = await NotificationChannelService.sendSMS(
            metadata.phone,
            smsMessage,
          );
          console.log(`✅ SMS sent to ${metadata.phone} for ${title}`);
        } catch (error) {
          console.error(`❌ SMS failed for ${metadata.phone}:`, error.message);
          results.sms = { success: false, error: error.message };
        }
      }

      // Send Web Push (if subscription available)
      if (metadata.webPushSubscription) {
        try {
          results.webPush = await NotificationChannelService.sendWebPush(
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
          console.log(`✅ Web Push sent to student ${studentId} for ${title}`);
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
          results.push = await NotificationChannelService.sendFCMPush(
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
          console.log(`✅ FCM Push sent to student ${studentId} for ${title}`);
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
        results.inApp = await NotificationChannelService.sendInAppNotification({
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
          `✅ In-App notification for student ${studentId}: ${title}`,
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
   * Helper: Get month name from index
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
}

export default NotificationTemplateService;
