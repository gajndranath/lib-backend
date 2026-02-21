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
   * Internal helper to sync total due amount to the latest month's balance
   * In a carry-forward system, the latest month's totalAmount - paidAmount 
   * represents the entire outstanding history.
   */
  static async _syncTotalDue(dueRecord) {
    const { month, year } = parseMonthYearKey(dueRecord.monthsDue[dueRecord.monthsDue.length - 1]);
    const latestFee = await StudentMonthlyFee.findOne({
      studentId: dueRecord.studentId,
      month,
      year
    });
    
    if (latestFee) {
      dueRecord.totalDueAmount = roundFeeAmount(latestFee.totalAmount - (latestFee.paidAmount || 0));
      await dueRecord.save();
    }
  }

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
        // Sort monthsDue to ensure the latest one is always at the end
        dueRecord.monthsDue.sort();
      }
      dueRecord.reminderDate = reminderDate || dueRecord.reminderDate;
      await this._syncTotalDue(dueRecord);
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
    const AdminActionLog = (await import("../models/adminActionLog.model.js")).AdminActionLog;
    await AdminActionLog.create({
      adminId,
      action: "MARK_DUE",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      oldValue: { status: "PENDING" },
      newValue: { status: "DUE", reminderDate },
      metadata: { studentId, month, year },
    });

    // Notify Student
    const Notification = (await import("../models/notification.model.js")).default;
    const { getMonthName } = await import("../utils/feeHelpers.js");
    await Notification.create({
      userId: studentId,
      userType: "Student",
      title: "Fee Payment Due",
      message: `Your fee for ${getMonthName(month)} ${year} has been marked as DUE. Please pay ₹${monthlyFee.totalAmount} to avoid services disruption.`,
      type: "FEE_DUE",
      priority: "HIGH",
      tenantId: monthlyFee.tenantId
    });

    // Invalidate fee caches
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
    reminderDate = null
  ) {
    let dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    if (dueRecord) {
      if (!dueRecord.monthsDue.includes(monthKey)) {
        dueRecord.monthsDue.push(monthKey);
        dueRecord.monthsDue.sort();
      }
      if (reminderDate) dueRecord.reminderDate = reminderDate;
      // Use the robust sync logic
      await this._syncTotalDue(dueRecord);
    } else {
      dueRecord = await DueRecord.create({
        studentId,
        monthsDue: [monthKey],
        totalDueAmount: dueAmount,
        reminderDate: reminderDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
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
        dueRecord.resolutionDate = new Date();
        dueRecord.totalDueAmount = 0;
        await dueRecord.save();
      } else {
        // Sync total due to the remaining latest month
        await this._syncTotalDue(dueRecord);
      }
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

  static async recalculateAllCF(studentId, adminId = null) {
    // If no adminId is provided (e.g. during a system automated cascade), 
    // find a system admin (the first SUPER_ADMIN) to attribute the changes to.
    if (!adminId || adminId === "65d1a8f9f1b2c3d4e5f6a8b7") {
      const { Admin } = await import("../models/admin.model.js");
      const systemAdmin = await Admin.findOne({ role: "SUPER_ADMIN" }).sort({ createdAt: 1 });
      adminId = systemAdmin ? systemAdmin._id : adminId;
    }

    // 1. Fetch all fees sorted by date
    const fees = await StudentMonthlyFee.find({ studentId }).sort({ year: 1, month: 1 });
    
    let currentDueBalance = 0;
    
    for (const fee of fees) {
      // Set the carry forward for THIS month based on previous month's balance
      if (fee.dueCarriedForwardAmount !== currentDueBalance) {
        fee.dueCarriedForwardAmount = currentDueBalance;
        await fee.save();
      }
      
      // Calculate what carries forward to the NEXT month
      const total = fee.baseFee + fee.dueCarriedForwardAmount;
      currentDueBalance = Math.max(0, roundFeeAmount(total - (fee.paidAmount || 0)));
    }
    
    // Also sync the DueRecord
    const dueRecord = await DueRecord.findOne({ studentId, resolved: false });
    if (dueRecord) {
      await this._syncTotalDue(dueRecord);
    }

    // NEW POLICY: Apply Advance to future PENDING/DUE if available
    // (This helps resolve the ledger automatically when an overpayment happens in the past)
    const FeeAdvanceService = (await import("./feeAdvance.service.js")).default;
    for (const fee of fees) {
      if (fee.status !== "PAID") {
         const currentTotal = fee.baseFee + fee.dueCarriedForwardAmount;
         if (currentTotal > 0) {
            await FeeAdvanceService.applyAdvanceIfAvailable(
              studentId, 
              fee.month, 
              fee.year, 
              currentTotal, 
              adminId
            );
         }
      }
    }
    
    return currentDueBalance;
  }
}

export default FeeDueService;
