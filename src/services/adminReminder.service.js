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
                  studentId: studentFee.studentId._id,
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
                  `Failed to send end-of-month reminder to student ${studentFee.studentId._id}:`,
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
}

export default AdminReminderService;
