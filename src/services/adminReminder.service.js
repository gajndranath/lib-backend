import { AdminReminder } from "../models/adminReminder.model.js";
import { DueRecord, ESCALATION_LEVELS } from "../models/dueRecord.model.js";
import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import NotificationService from "./notification.service.js";
import { ApiError } from "../utils/ApiError.js";
import { getFeeDueDate, getMonthName } from "../utils/feeHelpers.js";

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
        const reminder = await AdminReminder.create({
          adminId: admin._id,
          type: "DUE_STUDENTS",
          title: `Student Payment Due: ${student.name}`,
          message: `${student.name} (ID: ${student.libraryId || student._id}) has not paid their fee for the months due. Total due: ₹${dueRecord.totalDueAmount}`,
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

        // Send immediate notification to admin
        try {
          await NotificationService.sendAdminNotification(
            admin._id,
            `Student Payment Due: ${student.name}`,
            `${student.name} has not paid their fee. Total due: ₹${dueRecord.totalDueAmount}`,
            "FEE_DUE",
          );
        } catch (error) {
          console.error(
            `Failed to notify admin ${admin._id} about student due:`,
            error,
          );
        }

        // Also send notification to the student (always create in-app)
        try {
          await NotificationService.sendMultiChannelNotification({
            studentId: student._id,
            studentName: student.name,
            email: student.email,
            title: `Payment Due: ${dueRecord.totalDueAmount}`,
            message: `Dear ${student.name}, your outstanding fee of ₹${dueRecord.totalDueAmount} is due. Please pay at your earliest convenience.`,
            type: "PAYMENT_DUE",
            metadata: {
              phone: student.phone,
              fcmToken: student.fcmToken,
              webPushSubscription: student.webPushSubscription,
              dueAmount: dueRecord.totalDueAmount,
              reminderId: reminder._id,
            },
          });
        } catch (error) {
          console.error(
            `Failed to notify student ${studentId} about payment due:`,
            error,
          );
        }
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
          .populate(
            "studentId",
            "name libraryId email phone fcmToken webPushSubscription",
          )
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

            const studentIds = dueStudents.map((f) => f.studentId?._id).filter(id => id);

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

            // Send notification to admin
            try {
              await NotificationService.sendAdminNotification(
                admin._id,
                reminder.title,
                reminder.message,
                "END_OF_MONTH_DUE",
              );
            } catch (error) {
              console.error(
                `Failed to notify admin about end-of-month due:`,
                error,
              );
            }

            // Send reminders to all due students
            for (const studentFee of dueStudents) {
              try {
                await NotificationService.sendMultiChannelNotification({
                  studentId: studentFee.studentId?._id,
                  studentName: studentFee.studentId.name,
                  email: studentFee.studentId.email,
                  title: "Month-End Payment Reminder",
                  message: `Dear ${studentFee.studentId.name}, the month is ending. Please pay your pending fee to avoid late charges.`,
                  type: "END_OF_MONTH_DUE",
                  metadata: {
                    phone: studentFee.studentId.phone,
                    fcmToken: studentFee.studentId.fcmToken,
                    webPushSubscription:
                      studentFee.studentId.webPushSubscription,
                    reminderId: reminder._id,
                  },
                });
              } catch (error) {
                console.error(
                  `Failed to send end-of-month reminder to student ${studentFee.studentId?._id || "unknown"}:`,
                  error,
                );
              }
            }
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
  static async sendReminder(reminderId, options = {}) {
    const { notifyAdmin = true } = options;
    const reminder = await AdminReminder.findById(reminderId).populate(
      "affectedStudents",
      "name email phone fcmToken webPushSubscription",
    );

    if (!reminder) {
      throw new ApiError(404, "Reminder not found");
    }

    if (!reminder.isActive || reminder.isPaused) {
      throw new ApiError(400, "Reminder is not active");
    }

    const deliveryChannels = reminder.deliverVia || ["IN_APP"];
    const affectedStudents = reminder.affectedStudents || [];

    // Send notifications to each affected student
    for (const student of affectedStudents) {
      // Send via each channel
      for (const channel of deliveryChannels) {
        try {
          let result;

          if (channel === "IN_APP") {
            result = await NotificationService.sendInAppNotification({
              userId: student._id,
              title: reminder.title,
              message: reminder.message,
              type: reminder.type,
              data: {
                reminderId: reminder._id,
                studentId: student._id,
              },
            });

            // Also send web push for PWA if available
            if (student.webPushSubscription) {
              await NotificationService.sendWebPush(
                student.webPushSubscription,
                {
                  title: reminder.title,
                  body: reminder.message,
                  data: {
                    type: reminder.type,
                    studentId: student._id.toString(),
                    reminderId: reminder._id.toString(),
                    url: "/student/notifications",
                    userType: "Student",
                  },
                },
              );
            }
          } else if (channel === "EMAIL") {
            // Send email notification
            if (student.email) {
              result = await NotificationService.sendMultiChannelNotification({
                studentId: student._id,
                studentName: student.name,
                email: student.email,
                title: reminder.title,
                message: reminder.message,
                type: reminder.type,
                metadata: {
                  phone: student.phone,
                  fcmToken: student.fcmToken,
                  webPushSubscription: student.webPushSubscription,
                  reminderId: reminder._id,
                },
              });
            }
          } else if (channel === "PUSH") {
            // Send push notification
            if (student.fcmToken) {
              result = await NotificationService.sendFCMPush(
                student.fcmToken,
                {
                  title: reminder.title,
                  body: reminder.message,
                },
                {
                  type: reminder.type,
                  reminderId: reminder._id.toString(),
                  studentId: student._id.toString(),
                },
              );
            }
          }

          // Log successful send
          reminder.notificationHistory.push({
            sentAt: new Date(),
            channel,
            status: "SENT",
            studentId: student._id,
          });
        } catch (error) {
          console.error(
            `Failed to send ${channel} reminder to student ${student._id}:`,
            error,
          );
          reminder.notificationHistory.push({
            sentAt: new Date(),
            channel,
            status: "FAILED",
            errorMessage: error.message,
            studentId: student._id,
          });
        }
      }
    }

    // Also send notification to admin (system-generated only)
    if (notifyAdmin) {
      try {
        await NotificationService.sendAdminNotification(
          reminder.adminId,
          reminder.title,
          reminder.message,
          reminder.type,
        );
      } catch (error) {
        console.error("Failed to send admin notification:", error);
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

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Daily Overdue Escalation Cron
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run daily at 09:00.
   * Finds all unresolved DueRecords whose nextReminderDue <= now, sends
   * the appropriate escalation reminder to both student and admin, and
   * advances the schedule to the next escalation tier.
   */
  static async processDailyOverdueEscalations() {
    const now = new Date();

    // Find records that are due for a reminder right now
    const records = await DueRecord.find({
      resolved: false,
      $or: [
        { nextReminderDue: { $lte: now } },          // scheduled slot reached
        { nextReminderDue: null, reminderCount: 0 }, // brand new, never sent
      ],
    }).populate("studentId", "name email phone fcmToken webPushSubscription");

    if (records.length === 0) {
      console.log("[Escalation] No due records ready for escalation.");
      return { processed: 0, escalated: [], errors: [] };
    }

    const escalated = [];
    const errors = [];

    for (const record of records) {
      try {
        const student = record.studentId;
        if (!student) continue;

        record.updateEscalationLevel();
        const level = record.escalationLevel;
        const levelLabel = ESCALATION_LEVELS[level]?.label ?? "unknown";
        const urgencyEmoji = ["🟢", "🟡", "🟠", "🔴", "🔴", "⛔"][level] ?? "🔴";

        // Build escalation-aware messages
        const daysLate = record.daysOverdue;
        const monthList = record.monthsDue.join(", ");
        const studentTitle = `${urgencyEmoji} Fee Overdue — ${daysLate} day${daysLate !== 1 ? "s" : ""} late`;
        const studentMsg = `Dear ${student.name}, your fee of ₹${record.totalDueAmount} for month(s) ${monthList} is ${daysLate} day(s) overdue. Please pay immediately to avoid service disruption.`;

        // Notify student
        try {
          await NotificationService.sendMultiChannelNotification({
            studentId: student._id,
            studentName: student.name,
            email: student.email,
            title: studentTitle,
            message: studentMsg,
            type: "FEE_OVERDUE_ESCALATION",
            metadata: {
              phone: student.phone,
              fcmToken: student.fcmToken,
              webPushSubscription: student.webPushSubscription,
              escalationLevel: level,
              daysOverdue: daysLate,
            },
          });
        } catch (e) {
          console.error(`[Escalation] Failed to notify student ${student._id}:`, e.message);
        }

        // Notify admin — escalate to super-admin at level 5
        try {
          const adminTitle = `${urgencyEmoji} [${levelLabel.toUpperCase()}] ${student.name} — ${daysLate}d overdue`;
          const adminMsg = `Student ${student.name} has not paid ₹${record.totalDueAmount} for ${monthList}. Overdue by ${daysLate} days. Escalation level: ${level}/5.`;

          if (level >= 5) {
            // Super admin escalation — send system alert
            await NotificationService.sendSystemAlert(adminTitle, adminMsg, "CRITICAL");
          } else {
            await NotificationService.sendAdminNotification(
              record.createdBy ?? null,
              adminTitle,
              adminMsg,
              "FEE_OVERDUE_ESCALATION",
            );
          }
        } catch (e) {
          console.error(`[Escalation] Failed to notify admin for record ${record._id}:`, e.message);
        }

        // Advance escalation and save
        record.recordReminderSent();
        await record.save();

        escalated.push({
          studentId: student._id,
          studentName: student.name,
          daysOverdue: daysLate,
          escalationLevel: level,
          totalDueAmount: record.totalDueAmount,
        });
      } catch (err) {
        console.error(`[Escalation] Error processing record ${record._id}:`, err.message);
        errors.push({ recordId: record._id, error: err.message });
      }
    }

    console.log(`[Escalation] Processed ${records.length} records — Escalated: ${escalated.length}, Errors: ${errors.length}`);
    return { processed: records.length, escalated, errors };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Auto-Mark Overdue Fees as DUE (runs on 6th of month)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Auto-marks all PENDING fees from the previous month as DUE.
   * Called by cron on the 6th of each month (day after grace period ends).
   * Creates/updates DueRecords and sends one batch admin notification.
   */
  static async autoMarkOverdueFees() {
    const today = new Date();
    // Target the previous month
    const targetMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const targetYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();

    console.log(`[AutoMark] Checking PENDING fees for ${getMonthName(targetMonth)} ${targetYear}...`);

    // Find all PENDING fees for last month that haven't been locked/advance-covered
    const pendingFees = await StudentMonthlyFee.find({
      month: targetMonth,
      year:  targetYear,
      status: "PENDING",
      coveredByAdvance: false,
      locked: false,
    }).populate("studentId", "name email phone fcmToken webPushSubscription tenantId");

    if (pendingFees.length === 0) {
      console.log("[AutoMark] No pending fees to mark as DUE.");
      return { marked: 0, errors: [] };
    }

    const FeeDueService = (await import("./feeDue.service.js")).default;
    const { createMonthYearKey } = await import("../utils/feeHelpers.js");
    const feeDueDate = getFeeDueDate(targetMonth, targetYear); // 5th of current month
    const monthKey = createMonthYearKey(targetMonth, targetYear);

    const marked = [];
    const errors = [];

    for (const fee of pendingFees) {
      try {
        // Update fee status
        fee.status = "DUE";
        await fee.save();

        const studentId = fee.studentId?._id || fee.studentId;

        // Create or update DueRecord
        let dueRecord = await DueRecord.findOne({ studentId, resolved: false });
        if (dueRecord) {
          if (!dueRecord.monthsDue.includes(monthKey)) {
            dueRecord.monthsDue.push(monthKey);
            dueRecord.monthsDue.sort();
          }
          // Set dueSince to the earliest fee due date if not set
          if (!dueRecord.dueSince) dueRecord.dueSince = feeDueDate;
          dueRecord.totalDueAmount += (fee.totalAmount - (fee.paidAmount || 0));
          dueRecord.updateEscalationLevel();
          // Trigger first reminder immediately
          if (!dueRecord.nextReminderDue) {
            const next = new Date();
            next.setHours(9, 30, 0, 0);
            dueRecord.nextReminderDue = next;
          }
          await dueRecord.save();
        } else {
          const next = new Date();
          next.setHours(9, 30, 0, 0);
          dueRecord = await DueRecord.create({
            studentId,
            monthsDue: [monthKey],
            totalDueAmount: fee.totalAmount - (fee.paidAmount || 0),
            dueSince: feeDueDate,
            reminderDate: next,
            nextReminderDue: next,
            escalationLevel: 0,
            tenantId: fee.tenantId,
          });
        }

        marked.push({ studentId, name: fee.studentId?.name });
      } catch (err) {
        console.error(`[AutoMark] Error for student ${fee.studentId?._id}:`, err.message);
        errors.push({ studentId: fee.studentId?._id, error: err.message });
      }
    }

    // Send one consolidated admin notification listing all newly-due students
    if (marked.length > 0) {
      try {
        const nameList = marked.map((m) => `• ${m.name}`).join("\n");
        await NotificationService.sendSystemAlert(
          `📋 Auto-Due: ${marked.length} student${marked.length > 1 ? "s" : ""} marked DUE for ${getMonthName(targetMonth)} ${targetYear}`,
          `The following ${marked.length} student(s) did not pay by the 5th and have been auto-marked as DUE:\n\n${nameList}\n\nPlease review and send reminders from the admin dashboard.`,
          "WARNING",
        );
      } catch (e) {
        console.error("[AutoMark] Failed to send admin batch alert:", e.message);
      }
    }

    console.log(`[AutoMark] Done. Marked: ${marked.length}, Errors: ${errors.length}`);
    return { marked: marked.length, errors };
  }
}

export default AdminReminderService;
