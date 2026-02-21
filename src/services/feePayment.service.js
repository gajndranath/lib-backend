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

    const dueAmount = roundFeeAmount(monthlyFee.totalAmount - paidAmount);
    const monthKey = createMonthYearKey(month, year);

    // CASCADE RESOLUTION: If this payment covers previous dues, we must resolve them too
    if (paidAmount >= monthlyFee.totalAmount) {
      // Resolve any previous DUE months listed in the carry-forward
      const DueRecord = (await import("../models/dueRecord.model.js")).DueRecord;
      const dueRecord = await DueRecord.findOne({ studentId, resolved: false });
      
      if (dueRecord) {
        // Iterate through all months in the due record and mark them as PAID if they are before this month
        const currentMonthKey = monthKey;
        for (const mk of dueRecord.monthsDue) {
          if (mk < currentMonthKey) {
             const { month: m, year: y } = (await import("../utils/feeHelpers.js")).parseMonthYearKey(mk);
             const pastFee = await StudentMonthlyFee.findOne({ studentId, month: m, year: y });
             if (pastFee && pastFee.status !== "PAID") {
               pastFee.status = "PAID";
               pastFee.paidAmount = pastFee.totalAmount;
               pastFee.paymentDate = new Date();
               pastFee.paymentMethod = paymentData.paymentMethod;
               pastFee.locked = true;
               await pastFee.save();
             }
          }
        }
        // Finally, resolve this specific month in the due record system
        await FeeDueService.resolveDueRecordForMonth(studentId, monthKey);
      }
    } else if (dueAmount > 0) {
      // Partial payment logic remains...
      await FeeDueService.updateDueRecordForPartialPayment(
        studentId,
        monthKey,
        dueAmount,
        adminId,
        paymentData.reminderDate,
      );
    } else {
      // Full payment (but maybe no carry forward)
      await FeeDueService.resolveDueRecordForMonth(studentId, monthKey);
    }

    // ADVANCE HANDLING: If student overpaid, add excess to Advance Balance
    const surplus = paidAmount - monthlyFee.totalAmount;
    if (surplus > 0) {
      await FeeAdvanceService.addAdvance(studentId, surplus, adminId);
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
          .reduce((sum, fee) => sum + (fee.baseFee + (fee.dueCarriedForwardAmount || 0)), 0);
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
    const Student = (await import("../models/student.model.js")).Student;
    // 1. Fetch all ACTIVE students who should have a fee for this month
    const activeStudents = await Student.find({
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("name status monthlyFee joiningDate")
      .lean();

    // 2. Fetch all existing fee records for this month/year
    const monthlyFees = await StudentMonthlyFee.find({
      month,
      year,
      studentId: { $in: activeStudents.map((s) => s._id) },
    }).lean();

    // 3. Create a map for quick fee lookup
    const feeMap = new Map(
      monthlyFees.map((f) => [f.studentId.toString(), f]),
    );

    // 4. Reconcile Students with Fees
    const details = activeStudents.map((student) => {
      const fee = feeMap.get(student._id.toString());
      
      if (fee) {
        return {
          studentId: student._id.toString(),
          studentName: student.name,
          studentStatus: student.status,
          month: fee.month,
          year: fee.year,
          baseFee: fee.baseFee,
          dueCarriedForward: fee.dueCarriedForwardAmount || 0,
          totalAmount: fee.baseFee + (fee.dueCarriedForwardAmount || 0),
          status: fee.status, // PAID, DUE, PENDING
          coveredByAdvance: fee.coveredByAdvance,
          locked: fee.locked,
          paymentDate: fee.paymentDate,
        };
      }

      // Record not generated yet
      return {
        studentId: student._id.toString(),
        studentName: student.name,
        studentStatus: student.status,
        month,
        year,
        baseFee: student.monthlyFee,
        dueCarriedForward: 0,
        totalAmount: student.monthlyFee,
        status: "NOT_GENERATED", // New status for UI
        coveredByAdvance: false,
        locked: false,
        paymentDate: null,
      };
    });

    // 5. Calculate Stats from Reconciled Data
    const stats = {
      total: details.length,
      paid: details.filter((d) => d.status === "PAID").length,
      due: details.filter((d) => d.status === "DUE").length,
      pending: details.filter((d) => d.status === "PENDING").length,
      notGenerated: details.filter((d) => d.status === "NOT_GENERATED").length,
      totalAmount: details.reduce((sum, d) => sum + d.totalAmount, 0),
      paidAmount: details
        .filter((d) => d.status === "PAID")
        .reduce((sum, d) => sum + d.totalAmount, 0),
      dueAmount: details
        .filter((d) => d.status === "DUE")
        .reduce((sum, d) => sum + d.totalAmount, 0),
      pendingAmount: details
        .filter((d) => d.status === "PENDING" || d.status === "NOT_GENERATED")
        .reduce((sum, d) => sum + d.totalAmount, 0),
    };

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
