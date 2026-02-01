import { AdminReminder } from "../models/adminReminder.model.js";
import { DueRecord } from "../models/dueRecord.model.js";
import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import NotificationService from "./notification.service.js";
import { ApiError } from "../utils/ApiError.js";

class AdminReminderService {
  /**
   * Create a reminder when student is marked as due
   */
  static async createDueStudentReminder(studentId, dueRecordId, adminId) {
    try {
      const student = await Student.findById(studentId);
      const dueRecord = await DueRecord.findById(dueRecordId);

      if (!student || !dueRecord) {
        throw new ApiError(404, "Student or due record not found");
      }

      // Get all admins to notify them
      const Admin = (await import("../models/admin.model.js")).Admin;
      const admins = await Admin.find({
        role: { $in: ["SUPER_ADMIN", "STAFF"] },
      });

      for (const admin of admins) {
        // Check if reminder already exists for this due record
        const existingReminder = await AdminReminder.findOne({
          adminId: admin._id,
          type: "DUE_STUDENTS",
          dueRecords: dueRecordId,
          isActive: true,
        });

        if (existingReminder) {
          continue; // Skip if reminder already exists
        }

        // Create reminder for admin
        await AdminReminder.create({
          adminId: admin._id,
          type: "DUE_STUDENTS",
          title: `Student Payment Due: ${student.name}`,
          message: `${student.name} (ID: ${student.studentId}) has not paid their fee for the months due. Total due: ₹${dueRecord.totalDueAmount}`,
          affectedStudents: [studentId],
          dueRecords: [dueRecordId],
          schedule: {
            type: "ONCE",
            startDate: new Date(),
          },
          deliverVia: ["IN_APP", "EMAIL"],
          isActive: true,
          createdBy: adminId,
          updatedBy: adminId,
        });

        // Send immediate notification
        await NotificationService.sendNotification(admin._id, {
          title: `Student Payment Due: ${student.name}`,
          message: `${student.name} has not paid their fee. Total due: ₹${dueRecord.totalDueAmount}`,
          type: "FEE_DUE",
          relatedId: studentId,
        });
      }
    } catch (error) {
      console.error("Error creating due student reminder:", error);
      // Don't throw - just log, as this shouldn't block the main operation
    }
  }

  /**
   * Get all active reminders for an admin
   */
  static async getAdminReminders(adminId, filters = {}) {
    const query = {
      adminId,
      isActive: true,
    };

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.isPaused !== undefined) {
      query.isPaused = filters.isPaused;
    }

    const reminders = await AdminReminder.find(query)
      .populate("affectedStudents", "name studentId status")
      .populate("dueRecords")
      .sort({ "schedule.nextTriggerDate": 1, createdAt: -1 })
      .lean();

    return reminders;
  }

  /**
   * Get reminder details
   */
  static async getReminderDetails(reminderId) {
    const reminder = await AdminReminder.findById(reminderId)
      .populate("affectedStudents")
      .populate("dueRecords")
      .populate("adminId", "name email")
      .lean();

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    return reminder;
  }

  /**
   * Pause a reminder
   */
  static async pauseReminder(reminderId, adminId, reason = "") {
    const reminder = await AdminReminder.findById(reminderId);

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (
      reminder.adminId.toString() !== adminId &&
      reminder.createdBy.toString() !== adminId
    ) {
      throw new ApiError(
        403,
        "You don't have permission to pause this reminder",
      );
    }

    reminder.isPaused = true;
    reminder.pausedAt = new Date();
    reminder.pauseReason = reason;
    reminder.updatedBy = adminId;

    await reminder.save();

    return reminder;
  }

  /**
   * Resume a paused reminder
   */
  static async resumeReminder(reminderId, adminId) {
    const reminder = await AdminReminder.findById(reminderId);

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (
      reminder.adminId.toString() !== adminId &&
      reminder.createdBy.toString() !== adminId
    ) {
      throw new ApiError(
        403,
        "You don't have permission to resume this reminder",
      );
    }

    reminder.isPaused = false;
    reminder.pausedAt = null;
    reminder.pauseReason = null;

    // Update next trigger date
    if (reminder.schedule.type !== "ONCE") {
      reminder.schedule.nextTriggerDate = this.calculateNextTriggerDate(
        new Date(),
        reminder.schedule.type,
      );
    }

    reminder.updatedBy = adminId;
    await reminder.save();

    return reminder;
  }

  /**
   * Stop/deactivate a reminder
   */
  static async stopReminder(reminderId, adminId) {
    const reminder = await AdminReminder.findById(reminderId);

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (
      reminder.adminId.toString() !== adminId &&
      reminder.createdBy.toString() !== adminId
    ) {
      throw new ApiError(
        403,
        "You don't have permission to stop this reminder",
      );
    }

    reminder.isActive = false;
    reminder.updatedBy = adminId;

    await reminder.save();

    return reminder;
  }

  /**
   * Edit reminder details (title, message, schedule, delivery channels)
   */
  static async updateReminder(reminderId, adminId, updates) {
    const reminder = await AdminReminder.findById(reminderId);

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (
      reminder.adminId.toString() !== adminId &&
      reminder.createdBy.toString() !== adminId
    ) {
      throw new ApiError(
        403,
        "You don't have permission to edit this reminder",
      );
    }

    // Allow editing these fields
    const allowedFields = ["title", "message", "deliverVia", "schedule"];
    for (const field of allowedFields) {
      if (field in updates) {
        if (field === "schedule") {
          reminder.schedule = { ...reminder.schedule, ...updates.schedule };
          // Recalculate next trigger date
          if (updates.schedule.type && updates.schedule.type !== "ONCE") {
            reminder.schedule.nextTriggerDate = this.calculateNextTriggerDate(
              new Date(),
              updates.schedule.type,
            );
          }
        } else {
          reminder[field] = updates[field];
        }
      }
    }

    reminder.updatedBy = adminId;
    await reminder.save();

    return reminder;
  }

  /**
   * Calculate next trigger date based on schedule type
   */
  static calculateNextTriggerDate(currentDate, scheduleType) {
    const next = new Date(currentDate);

    switch (scheduleType) {
      case "DAILY":
        next.setDate(next.getDate() + 1);
        break;
      case "WEEKLY":
        next.setDate(next.getDate() + 7);
        break;
      case "MONTHLY":
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        return null;
    }

    return next;
  }

  /**
   * Process end-of-month due reminders (cron job)
   */
  static async processEndOfMonthDueReminders() {
    try {
      const today = new Date();
      const lastDayOfMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      );
      const daysUntilMonthEnd = lastDayOfMonth.getDate() - today.getDate();

      // Trigger reminder on the last 3 days of the month
      if (daysUntilMonthEnd <= 3 && daysUntilMonthEnd >= 0) {
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Get all students with unpaid fees for this month
        const dueStudents = await StudentMonthlyFee.find({
          month: currentMonth,
          year: currentYear,
          status: { $in: ["DUE", "PENDING"] },
          locked: false,
        })
          .populate("studentId", "name studentId")
          .lean();

        if (dueStudents.length > 0) {
          // Get all admins
          const Admin = (await import("../models/admin.model.js")).Admin;
          const admins = await Admin.find({
            role: { $in: ["SUPER_ADMIN", "STAFF"] },
          });

          for (const admin of admins) {
            // Check if reminder already exists for this month
            const existingReminder = await AdminReminder.findOne({
              adminId: admin._id,
              type: "END_OF_MONTH_DUE",
              month: currentMonth,
              year: currentYear,
              isActive: true,
            });

            if (existingReminder) {
              continue;
            }

            const studentIds = dueStudents.map((f) => f.studentId._id);

            // Create end-of-month reminder
            const reminder = await AdminReminder.create({
              adminId: admin._id,
              type: "END_OF_MONTH_DUE",
              title: `End of Month - ${dueStudents.length} Student(s) Still Due`,
              message: `${dueStudents.length} student(s) have not paid their fees for ${new Date(currentYear, currentMonth).toLocaleString("default", { month: "long", year: "numeric" })}. Please send reminders before the month ends.`,
              affectedStudents: studentIds,
              schedule: {
                type: "ONCE",
                startDate: new Date(),
              },
              deliverVia: ["IN_APP", "EMAIL"],
              month: currentMonth,
              year: currentYear,
              isActive: true,
            });

            // Send notification
            await NotificationService.sendNotification(admin._id, {
              title: reminder.title,
              message: reminder.message,
              type: "END_OF_MONTH_DUE",
            });
          }
        }
      }
    } catch (error) {
      console.error("Error processing end-of-month reminders:", error);
    }
  }

  /**
   * Get end-of-month due students summary
   */
  static async getEndOfMonthDueSummary(month, year) {
    const dueStudents = await StudentMonthlyFee.find({
      month,
      year,
      status: { $in: ["DUE", "PENDING"] },
      locked: false,
    })
      .populate("studentId", "name studentId email phone monthlyFee")
      .sort({ "studentId.name": 1 })
      .lean();

    const totalDueAmount = dueStudents.reduce(
      (sum, fee) => sum + fee.totalAmount,
      0,
    );

    return {
      month,
      year,
      totalDueStudents: dueStudents.length,
      students: dueStudents,
      totalDueAmount,
    };
  }

  /**
   * Send reminder notifications (can be called manually or by cron)
   */
  static async sendReminder(reminderId) {
    const reminder = await AdminReminder.findById(reminderId);

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (!reminder.isActive || reminder.isPaused) {
      throw new ApiError(400, "Reminder is not active");
    }

    const deliveryChannels = reminder.deliverVia || ["IN_APP"];

    // Send via each channel
    for (const channel of deliveryChannels) {
      try {
        if (channel === "IN_APP") {
          await NotificationService.sendNotification(reminder.adminId, {
            title: reminder.title,
            message: reminder.message,
            type: reminder.type,
            relatedId: reminder._id,
          });
        } else if (channel === "EMAIL") {
          // Send email notification
          await NotificationService.sendEmailNotification(reminder.adminId, {
            subject: reminder.title,
            body: reminder.message,
          });
        }
        // Add SMS and PUSH support as needed

        // Log successful send
        reminder.notificationHistory.push({
          sentAt: new Date(),
          channel,
          status: "SENT",
        });
      } catch (error) {
        reminder.notificationHistory.push({
          sentAt: new Date(),
          channel,
          status: "FAILED",
          errorMessage: error.message,
        });
      }
    }

    // Update schedule for recurring reminders
    if (reminder.schedule.type !== "ONCE") {
      reminder.schedule.lastTriggeredAt = new Date();
      reminder.schedule.nextTriggerDate = this.calculateNextTriggerDate(
        new Date(),
        reminder.schedule.type,
      );
    }

    await reminder.save();
    return reminder;
  }
}

export default AdminReminderService;
