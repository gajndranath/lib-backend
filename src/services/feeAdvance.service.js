/**
 * Fee Advance Service
 * Handles advance payments and their application to monthly fees
 */

import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import { roundFeeAmount } from "../utils/feeHelpers.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS } from "../utils/cacheStrategy.js";

class FeeAdvanceService {
  /**
   * Add advance payment
   */
  static async addAdvance(studentId, amount, adminId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const roundedAmount = roundFeeAmount(amount);

    // Check if advance balance exists
    let advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (advanceBalance) {
      // Add to existing advance
      advanceBalance.totalAmount = roundFeeAmount(
        advanceBalance.totalAmount + roundedAmount,
      );
      advanceBalance.remainingAmount = roundFeeAmount(
        advanceBalance.remainingAmount + roundedAmount,
      );
      await advanceBalance.save();
    } else {
      // Create new advance balance
      advanceBalance = await AdvanceBalance.create({
        studentId,
        totalAmount: roundedAmount,
        remainingAmount: roundedAmount,
        usedAmount: 0,
        createdBy: adminId,
      });
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "ADD_ADVANCE",
      targetEntity: "ADVANCE",
      targetId: advanceBalance._id,
      newValue: { amount: roundedAmount },
      metadata: { studentId },
    });

    // Invalidate advance and fee summary caches
    await Promise.all([
      cacheService.del(CACHE_KEYS.STUDENT_ADVANCE(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT_FEES(studentId.toString())),
    ]);

    return advanceBalance;
  }

  /**
   * Apply advance to a specific month
   */
  static async applyAdvanceToMonth(studentId, month, year, adminId) {
    const monthlyFee = await StudentMonthlyFee.findOne({
      studentId,
      month,
      year,
    });

    if (!monthlyFee) {
      throw new ApiError(404, "Fee record not found");
    }

    if (monthlyFee.coveredByAdvance) {
      throw new ApiError(400, "Month already covered by advance");
    }

    const advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (!advanceBalance) {
      throw new ApiError(404, "No advance balance found");
    }

    if (advanceBalance.remainingAmount < monthlyFee.totalAmount) {
      throw new ApiError(400, "Insufficient advance balance");
    }

    // Apply advance using model method
    await advanceBalance.applyToMonth(month, year, monthlyFee.totalAmount);

    // Update fee record
    monthlyFee.status = "PAID";
    monthlyFee.coveredByAdvance = true;
    monthlyFee.paymentDate = new Date();
    monthlyFee.updatedBy = adminId;
    await monthlyFee.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "APPLY_ADVANCE",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      newValue: { coveredByAdvance: true },
      metadata: { studentId, month, year, amount: monthlyFee.totalAmount },
    });

    // Invalidate advance and fee summary caches
    await Promise.all([
      cacheService.del(CACHE_KEYS.STUDENT_ADVANCE(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT_FEES(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT_DUE(studentId.toString())),
    ]);

    return { monthlyFee, advanceBalance };
  }

  /**
   * Check if advance can cover a fee and apply automatically
   * Used during fee generation
   */
  static async applyAdvanceIfAvailable(
    studentId,
    month,
    year,
    totalAmount,
    adminId,
  ) {
    const advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (!advanceBalance) {
      return false;
    }

    if (advanceBalance.remainingAmount >= totalAmount) {
      try {
        await this.applyAdvanceToMonth(studentId, month, year, adminId);
        return true;
      } catch (error) {
        console.error("Failed to auto-apply advance:", error.message);
        return false;
      }
    }

    return false;
  }

  /**
   * Get advance balance for a student
   */
  static async getAdvanceBalance(studentId) {
    const advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (!advanceBalance) {
      return {
        exists: false,
        totalAmount: 0,
        remainingAmount: 0,
        usedAmount: 0,
      };
    }

    return {
      exists: true,
      totalAmount: advanceBalance.totalAmount,
      remainingAmount: advanceBalance.remainingAmount,
      usedAmount: advanceBalance.usedAmount,
      createdAt: advanceBalance.createdAt,
      updatedAt: advanceBalance.updatedAt,
    };
  }

  /**
   * Get advance usage history
   */
  static async getAdvanceUsageHistory(studentId) {
    const advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (!advanceBalance) {
      return [];
    }

    // Get all fees covered by advance
    const coveredFees = await StudentMonthlyFee.find({
      studentId,
      coveredByAdvance: true,
    })
      .sort({ year: -1, month: -1 })
      .select("month year totalAmount paymentDate");

    return coveredFees.map((fee) => ({
      month: fee.month,
      year: fee.year,
      amount: fee.totalAmount,
      appliedDate: fee.paymentDate,
    }));
  }
}

export default FeeAdvanceService;
