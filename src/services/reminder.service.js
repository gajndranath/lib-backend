import { Reminder } from "../models/reminder.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";
import { Student } from "../models/student.model.js";
import NotificationService from "./notification.service.js";
import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  PAYMENT_GRACE_PERIOD,
  ReminderType,
} from "../constants/constants.js";

class ReminderService {
  /**
   * Generate monthly reminders for all pending fees
   * Runs on 1st of every month
   */
  static async generateMonthlyReminders() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Calculate trigger date (end of month + grace period + default reminder time)
    const triggerDate = new Date(currentYear, currentMonth + 1, 0); // Last day of month
    triggerDate.setDate(triggerDate.getDate() + PAYMENT_GRACE_PERIOD);
    triggerDate.setHours(DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, 0, 0);

    // Find all pending fees for current month
    const pendingFees = await StudentMonthlyFee.find({
      month: currentMonth,
      year: currentYear,
      status: "PENDING",
      coveredByAdvance: false,
    }).populate("studentId", "name email phone");

    const reminders = [];

    for (const fee of pendingFees) {
      // Check if reminder already exists
      const existingReminder = await Reminder.findOne({
        studentId: fee.studentId?._id,
        month: currentMonth,
        year: currentYear,
        type: ReminderType.MONTHLY,
      });

      if (existingReminder) continue;

      // Create reminder
      const reminder = await Reminder.create({
        studentId: fee.studentId?._id,
        month: currentMonth,
        year: currentYear,
        triggerDate,
        type: ReminderType.MONTHLY,
        resolved: false,
      });

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Generate due reminders for overdue payments
   * Runs daily
   */
  static async generateDueReminders() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Find due records with reminder date <= today and not resolved
    const dueRecords = await DueRecord.find({
      reminderDate: { $lte: today },
      resolved: false,
    }).populate("studentId", "name email phone");

    const reminders = [];

    for (const dueRecord of dueRecords) {
      // Get the most recent due month
      const latestDueMonth = dueRecord.monthsDue.sort().pop();
      const [year, month] = latestDueMonth.split("-").map(Number);

      // Check if reminder already exists
      const existingReminder = await Reminder.findOne({
        studentId: dueRecord.studentId?._id,
        month: month - 1, // Convert to 0-indexed
        year,
        type: ReminderType.DUE,
      });

      if (existingReminder) continue;

      // Create reminder
      const reminder = await Reminder.create({
        studentId: dueRecord.studentId?._id,
        month: month - 1,
        year,
        triggerDate: dueRecord.reminderDate,
        type: ReminderType.DUE,
        resolved: false,
      });

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Process reminders for today
   * Runs via cron job
   */
  static async processTodayReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find reminders for today that aren't resolved
    const reminders = await Reminder.find({
      triggerDate: { $gte: today, $lt: tomorrow },
      resolved: false,
    }).populate("studentId", "name email phone");

    const results = {
      total: reminders.length,
      sent: 0,
      failed: 0,
      details: [],
    };

    for (const reminder of reminders) {
      try {
        // Get student details including push subscriptions
        const student = await Student.findById(reminder.studentId?._id);
        if (!student) {
          results.failed++;
          continue;
        }

        // Send notification via all channels
        const notificationType =
          reminder.type === ReminderType.DUE
            ? "PAYMENT_DUE"
            : "PAYMENT_REMINDER";

        const notificationResults =
          await NotificationService.sendMultiChannelNotification({
            studentId: reminder.studentId?._id,
            studentName: reminder.studentId.name,
            email: reminder.studentId.email,
            title: reminder.title,
            message: reminder.message,
            type: notificationType,
            metadata: {
              month: reminder.month,
              year: reminder.year,
              reminderId: reminder._id,
              phone: student.phone,
              webPushSubscription: student.webPushSubscription,
              fcmToken: student.fcmToken,
            },
          });

        // Mark as sent
        for (const channel of Object.keys(notificationResults)) {
          if (notificationResults[channel]) {
            await reminder.markSent(channel.toUpperCase());
          }
        }

        // For DUE reminders, keep sending daily until payment is resolved
        if (reminder.type === ReminderType.DUE) {
          const dueRecord = await DueRecord.findOne({
            studentId: reminder.studentId?._id,
            resolved: false,
          });

          if (!dueRecord) {
            reminder.resolved = true;
            await reminder.save();
          } else {
            const nextTrigger = new Date();
            nextTrigger.setDate(nextTrigger.getDate() + 1);
            nextTrigger.setHours(
              DEFAULT_REMINDER_HOUR,
              DEFAULT_REMINDER_MINUTE,
              0,
              0,
            );
            reminder.triggerDate = nextTrigger;
            await reminder.save();
          }
        }

        results.sent++;
        results.details.push({
          reminderId: reminder._id,
          studentName: reminder.studentId.name,
          type: reminder.type,
          channels: notificationResults,
          success: true,
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          reminderId: reminder._id,
          studentName: reminder.studentId.name,
          type: reminder.type,
          error: error.message,
          success: false,
        });
      }
    }

    // Notify Admins about the automated run
    if (results.sent > 0 || results.failed > 0) {
      try {
        const Admin = (await import("../models/admin.model.js")).Admin;
        const admins = await Admin.find({});
        
        for (const admin of admins) {
          await NotificationService.sendAdminNotification(
            admin._id,
            "Daily Reminders Processed",
            `Sent: ${results.sent}, Failed: ${results.failed}. Click to view details.`,
            "SYSTEM_ALERT"
          );
        }
      } catch (adminNotifyError) {
        console.error("Failed to notify admins about reminders:", adminNotifyError);
      }
    }

    return results;
  }

  /**
   * Get upcoming reminders for a student
   */
  static async getStudentReminders(studentId, limit = 10) {
    const today = new Date();

    const reminders = await Reminder.find({
      studentId,
      triggerDate: { $gte: today },
      resolved: false,
    })
      .sort({ triggerDate: 1 })
      .limit(limit);

    return reminders;
  }

  /**
   * Manually trigger a reminder
   */
  static async triggerReminder(reminderId, adminId) {
    const reminder = await Reminder.findById(reminderId).populate(
      "studentId",
      "name email phone",
    );

    if (!reminder) {
      throw new Error("Reminder not found");
    }

    if (reminder.resolved) {
      throw new Error("Reminder already resolved");
    }

    // Update trigger date to now
    reminder.triggerDate = new Date();
    await reminder.save();

    // Process immediately
    const result = await this.processReminder(reminder);

    return result;
  }
}

export default ReminderService;
