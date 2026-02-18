/**
 * Fee Due Service
 * Handles due tracking, reminders, and due record management
 */

import { DueRecord } from "../models/dueRecord.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { Reminder } from "../models/reminder.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import {
  createMonthYearKey,
  parseMonthYearKey,
  roundFeeAmount,
} from "../utils/feeHelpers.js";
import { ReminderType } from "../constants/constants.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS } from "../utils/cacheStrategy.js";

class FeeDueService {
  /**
   * Mark fee as due
   */
  static async markAsDue(studentId, month, year, reminderDate, adminId) {
    const FeeGenerationService = (await import("./feeGeneration.service.js"))
      .default;
    const monthlyFee = await FeeGenerationService.ensureMonthlyFeeExists(
      studentId,
      month,
      year,
      adminId,
    );

    if (monthlyFee.locked) {
      throw new ApiError(400, "This month is locked and cannot be modified");
    }

    if (monthlyFee.coveredByAdvance) {
      throw new ApiError(400, "This month is already covered by advance");
    }

    // Update fee status
    monthlyFee.status = "DUE";
    monthlyFee.updatedBy = adminId;
    await monthlyFee.save();

    const monthKey = createMonthYearKey(month, year);

    // Create or update due record
    let dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    if (dueRecord) {
      // Add to existing due record if not already there
      if (!dueRecord.monthsDue.includes(monthKey)) {
        dueRecord.monthsDue.push(monthKey);
        dueRecord.totalDueAmount = roundFeeAmount(
          dueRecord.totalDueAmount + monthlyFee.totalAmount,
        );
        dueRecord.reminderDate = reminderDate;
        await dueRecord.save();
      }
    } else {
      // Create new due record
      dueRecord = await DueRecord.create({
        studentId,
        monthsDue: [monthKey],
        totalDueAmount: monthlyFee.totalAmount,
        reminderDate,
        createdBy: adminId,
      });
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "MARK_DUE",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      oldValue: { status: monthlyFee.status },
      newValue: { status: "DUE", reminderDate },
      metadata: { studentId, month, year },
    });

    // Invalidate fee caches so next read reflects updated due status
    await Promise.all([
      cacheService.del(CACHE_KEYS.STUDENT_FEES(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT_DUE(studentId.toString())),
    ]);

    return { monthlyFee, dueRecord };
  }

  /**
   * Update due record for partial payment
   */
  static async updateDueRecordForPartialPayment(
    studentId,
    monthKey,
    dueAmount,
    adminId,
    reminderDate = null // New parameter
  ) {
    let dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    if (dueRecord) {
      // Add to existing due record if not already there
      if (!dueRecord.monthsDue.includes(monthKey)) {
        dueRecord.monthsDue.push(monthKey);
        dueRecord.totalDueAmount = roundFeeAmount(
          dueRecord.totalDueAmount + dueAmount,
        );
        // Update reminder date if provided
        if (reminderDate) dueRecord.reminderDate = reminderDate;
        await dueRecord.save();
      } else {
        // Month already exists in due record - update the amount
        dueRecord.totalDueAmount = roundFeeAmount(
          dueRecord.totalDueAmount + dueAmount,
        );
        if (reminderDate) dueRecord.reminderDate = reminderDate;
        await dueRecord.save();
      }
    } else {
      // Create new due record for partial payment
      dueRecord = await DueRecord.create({
        studentId,
        monthsDue: [monthKey],
        totalDueAmount: dueAmount,
        reminderDate: reminderDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Default to 3 days from now
        createdBy: adminId,
      });
    }

    return dueRecord;
  }

  /**
   * Resolve due record for a specific month (after full payment)
   */
  static async resolveDueRecordForMonth(studentId, monthKey) {
    const dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    if (dueRecord) {
      // Remove the month from dues
      dueRecord.monthsDue = dueRecord.monthsDue.filter((m) => m !== monthKey);

      // If no more months due, resolve the record
      if (dueRecord.monthsDue.length === 0) {
        dueRecord.resolved = true;
        dueRecord.resolvedAt = new Date();
        dueRecord.totalDueAmount = 0;
      } else {
        // Recalculate total due amount
        let newTotalDue = 0;
        for (const mk of dueRecord.monthsDue) {
          const { month, year } = parseMonthYearKey(mk);
          const fee = await StudentMonthlyFee.findOne({
            studentId,
            month,
            year,
          });
          if (fee && fee.status === "DUE") {
            newTotalDue += fee.totalAmount;
          }
        }
        dueRecord.totalDueAmount = roundFeeAmount(newTotalDue);
      }

      await dueRecord.save();
    }
  }

  /**
   * Get all due records for a student
   */
  static async getStudentDueRecords(studentId) {
    const dueRecords = await DueRecord.find({ studentId }).sort({
      createdAt: -1,
    });

    return dueRecords;
  }

  /**
   * Get current unresolved due record
   */
  static async getCurrentDueRecord(studentId) {
    const dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    return dueRecord;
  }

  /**
   * Create reminder for due payment
   */
  static async createDueReminder(studentId, month, year, dueRecordId) {
    const Student = (await import("../models/student.model.js")).Student;
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const dueRecord = await DueRecord.findById(dueRecordId);

    if (!dueRecord) {
      throw new ApiError(404, "Due record not found");
    }

    const reminder = await Reminder.create({
      studentId,
      month,
      year,
      triggerDate: dueRecord.reminderDate || new Date(),
      type: ReminderType.DUE,
      title: `Payment Due - ${student.name}`,
      message: `Total due amount: ₹${dueRecord.totalDueAmount}. Please pay at your earliest convenience.`,
      resolved: false,
    });

    return reminder;
  }
}

export default FeeDueService;
