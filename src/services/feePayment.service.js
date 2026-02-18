/**
 * Fee Payment Service
 * Handles payment recording, receipts, and payment tracking
 */

import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import {
  createMonthYearKey,
  getMonthName,
  roundFeeAmount,
} from "../utils/feeHelpers.js";
import FeeDueService from "./feeDue.service.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS, CACHE_TTL } from "../utils/cacheStrategy.js";

class FeePaymentService {
  /**
   * Mark fee as paid
   */
  static async markAsPaid(studentId, month, year, paymentData, adminId) {
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

    const paidAmount = roundFeeAmount(paymentData.paidAmount);

    // Use model method to record payment (handles status and locking)
    await monthlyFee.recordPayment({
      paidAmount: paidAmount,
      method: paymentData.paymentMethod, // Map frontend key to model key
      transactionId: paymentData.transactionId,
      remarks: paymentData.remarks,
    });

    monthlyFee.updatedBy = adminId;
    // monthlyFee.save() is already called inside recordPayment

    // Calculate due amount if payment is partial
    const dueAmount = roundFeeAmount(monthlyFee.totalAmount - paidAmount);

    const monthKey = createMonthYearKey(month, year);

    // If partial payment, create/update due record with remaining amount
    if (dueAmount > 0) {
      await FeeDueService.updateDueRecordForPartialPayment(
        studentId,
        monthKey,
        dueAmount,
        adminId,
        paymentData.reminderDate, // Pass reminder date if provided by admin
      );
    } else {
      // Full payment - resolve any existing due for this month
      await FeeDueService.resolveDueRecordForMonth(studentId, monthKey);
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "MARK_PAID",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      newValue: {
        status: monthlyFee.status,
        paidAmount: paidAmount,
        paymentMethod: paymentData.paymentMethod,
      },
      metadata: { studentId, month, year },
    });

    // Invalidate fee caches so next read reflects updated payment status
    await Promise.all([
      cacheService.del(CACHE_KEYS.STUDENT_FEES(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT_DUE(studentId.toString())),
      cacheService.del(CACHE_KEYS.STUDENT(studentId.toString())),
    ]);

    return monthlyFee;
  }

  /**
   * Get student fee summary
   */
  static async getStudentFeeSummary(studentId) {
    return cacheService.getOrSet(
      CACHE_KEYS.STUDENT_FEES(studentId.toString()),
      async () => {
        const Student = (await import("../models/student.model.js")).Student;
        const AdvanceBalance = (await import("../models/advanceBalance.model.js"))
          .AdvanceBalance;
        const DueRecord = (await import("../models/dueRecord.model.js")).DueRecord;

        const student = await Student.findById(studentId)
          .select("name monthlyFee")
          .lean();
        if (!student) {
          throw new ApiError(404, "Student not found");
        }

        const monthlyFees = await StudentMonthlyFee.find({ studentId })
          .select("status amount year month")
          .sort({ year: -1, month: -1 })
          .limit(12)
          .lean();

        const advanceBalance = await AdvanceBalance.findOne({ studentId })
          .select("remainingAmount")
          .lean();
        const dueRecord = await DueRecord.findOne({ studentId, resolved: false })
          .select("totalDueAmount")
          .lean();

        // Aggregate totals
        const allMonthlyFees = await StudentMonthlyFee.find({ studentId }).lean();
        
        const totalPaid = allMonthlyFees.reduce((sum, fee) => sum + (fee.paidAmount || 0), 0);
        const totalPending = allMonthlyFees
          .filter(fee => fee.status === 'PENDING')
          .reduce((sum, fee) => sum + fee.totalAmount, 0);
        const totalDue = dueRecord ? dueRecord.totalDueAmount : 0;

        const summary = {
          student: {
            name: student.name,
            monthlyFee: student.monthlyFee,
            status: student.status,
          },
          currentMonth: {
            month: new Date().getMonth(),
            year: new Date().getFullYear(),
          },
          totals: {
            totalPaid,
            totalDue,
            totalPending,
            overallTotal: totalPaid + totalDue + totalPending
          },
          feeHistory: monthlyFees.map((fee) => ({
            month: fee.month,
            year: fee.year,
            baseFee: fee.baseFee,
            dueCarriedForward: fee.dueCarriedForwardAmount,
            totalAmount: fee.totalAmount,
            status: fee.status,
            paidAmount: fee.paidAmount,
            paymentDate: fee.paymentDate,
            coveredByAdvance: fee.coveredByAdvance,
          })),
          advance: advanceBalance
            ? {
                totalAmount: advanceBalance.totalAmount,
                remainingAmount: advanceBalance.remainingAmount,
                usedAmount: advanceBalance.usedAmount,
              }
            : null,
          currentDue: dueRecord
            ? {
                totalDueAmount: dueRecord.totalDueAmount,
                monthsDue: dueRecord.monthsDue,
                reminderDate: dueRecord.reminderDate,
              }
            : null,
        };

        return summary;
      },
      CACHE_TTL.FEE_SUMMARY,
    );
  }

  /**
   * Calculate payment status for dashboard
   */
  static async getDashboardPaymentStatus(month, year) {
    const monthlyFees = await StudentMonthlyFee.find({
      month,
      year,
    })
      .populate("studentId", "name status")
      .lean();

    const stats = {
      total: monthlyFees.length,
      paid: monthlyFees.filter((f) => f.status === "PAID").length,
      due: monthlyFees.filter((f) => f.status === "DUE").length,
      pending: monthlyFees.filter((f) => f.status === "PENDING").length,
      totalAmount: monthlyFees.reduce((sum, f) => sum + f.totalAmount, 0),
      paidAmount: monthlyFees
        .filter((f) => f.status === "PAID")
        .reduce((sum, f) => sum + f.totalAmount, 0),
      dueAmount: monthlyFees
        .filter((f) => f.status === "DUE")
        .reduce((sum, f) => sum + f.totalAmount, 0),
      pendingAmount: monthlyFees
        .filter((f) => f.status === "PENDING")
        .reduce((sum, f) => sum + f.totalAmount, 0),
    };

    const details = monthlyFees.map((fee) => ({
      studentId: fee.studentId._id,
      studentName: fee.studentId.name,
      studentStatus: fee.studentId.status,
      month: fee.month,
      year: fee.year,
      baseFee: fee.baseFee,
      dueCarriedForward: fee.dueCarriedForwardAmount,
      totalAmount: fee.totalAmount,
      status: fee.status,
      coveredByAdvance: fee.coveredByAdvance,
      locked: fee.locked,
      paymentDate: fee.paymentDate,
    }));

    return { stats, details };
  }

  /**
   * Generate receipt for a paid fee
   */
  static async generateReceipt(studentId, month, year) {
    const monthlyFee = await StudentMonthlyFee.findOne({
      studentId,
      month,
      year,
    }).populate("studentId", "name phone email");

    if (!monthlyFee) {
      throw new ApiError(404, "Fee record not found");
    }

    if (monthlyFee.status !== "PAID") {
      throw new ApiError(400, "Receipt can only be generated for paid fees");
    }

    const receiptNumber = `RCP-${monthlyFee._id
      .toString()
      .slice(-8)
      .toUpperCase()}`;
    const monthYear = `${getMonthName(month)} ${year}`;

    return {
      receiptNumber,
      studentName: monthlyFee.studentId.name,
      studentPhone: monthlyFee.studentId.phone,
      monthYear,
      amount: monthlyFee.paidAmount || monthlyFee.totalAmount,
      paymentDate: monthlyFee.paymentDate,
      paymentMethod: monthlyFee.paymentMethod || "Not specified",
      transactionId: monthlyFee.transactionId || null,
      remarks: monthlyFee.remarks || null,
    };
  }
}

export default FeePaymentService;
