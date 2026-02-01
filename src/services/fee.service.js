import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import { PAYMENT_GRACE_PERIOD } from "../constants/constants.js";

class FeeService {
  /**
   * Generate monthly fee record for all active students
   */
  static async generateMonthlyFees(month, year, adminId) {
    const activeStudents = await Student.find({
      status: "ACTIVE",
      isDeleted: false,
    });

    const results = {
      generated: 0,
      skipped: 0,
      errors: [],
    };

    for (const student of activeStudents) {
      try {
        // Check if fee record already exists
        const existingFee = await StudentMonthlyFee.findOne({
          studentId: student._id,
          month,
          year,
        });

        if (existingFee) {
          results.skipped++;
          continue;
        }

        // Calculate due carry forward
        const previousMonth = month === 0 ? 11 : month - 1;
        const previousYear = month === 0 ? year - 1 : year;

        const previousFee = await StudentMonthlyFee.findOne({
          studentId: student._id,
          month: previousMonth,
          year: previousYear,
        });

        let dueCarriedForward = 0;
        if (previousFee && previousFee.status === "DUE") {
          dueCarriedForward =
            previousFee.baseFee + previousFee.dueCarriedForwardAmount;
        }

        // Create monthly fee record
        const monthlyFee = await StudentMonthlyFee.create({
          studentId: student._id,
          month,
          year,
          baseFee: student.monthlyFee,
          dueCarriedForwardAmount: dueCarriedForward,
          status: "PENDING",
          createdBy: adminId,
        });

        // Check if advance covers this month
        const advanceBalance = await AdvanceBalance.findOne({
          studentId: student._id,
        });

        if (
          advanceBalance &&
          advanceBalance.remainingAmount >= monthlyFee.totalAmount
        ) {
          await this.applyAdvanceToMonth(student._id, month, year, adminId);
        }

        results.generated++;
      } catch (error) {
        results.errors.push({
          student: student.name,
          error: error.message,
        });
      }
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "GENERATE_MONTHLY_FEES",
      targetEntity: "SYSTEM",
      targetId: adminId,
      newValue: { month, year, results },
      ipAddress: "SYSTEM",
      userAgent: "SYSTEM",
    });

    return results;
  }

  /**
   * Mark fee as paid
   */
  /**
   * Ensure monthly fee record exists, create if not found
   */
  static async ensureMonthlyFeeExists(studentId, month, year, adminId) {
    let monthlyFee = await StudentMonthlyFee.findOne({
      studentId,
      month,
      year,
    });

    if (!monthlyFee) {
      // Check if student exists and is active
      const student = await Student.findById(studentId);
      if (!student) {
        throw new ApiError(404, "Student not found");
      }

      // Calculate due carry forward from previous month
      const previousMonth = month === 0 ? 11 : month - 1;
      const previousYear = month === 0 ? year - 1 : year;

      const previousFee = await StudentMonthlyFee.findOne({
        studentId,
        month: previousMonth,
        year: previousYear,
      });

      let dueCarriedForward = 0;
      if (previousFee && previousFee.status === "DUE") {
        dueCarriedForward =
          previousFee.baseFee + previousFee.dueCarriedForwardAmount;
      }

      // Create monthly fee record
      monthlyFee = await StudentMonthlyFee.create({
        studentId,
        month,
        year,
        baseFee: student.monthlyFee,
        dueCarriedForwardAmount: dueCarriedForward,
        status: "PENDING",
        createdBy: adminId,
      });

      // Check if advance covers this month
      const advanceBalance = await AdvanceBalance.findOne({
        studentId,
      });

      if (
        advanceBalance &&
        advanceBalance.remainingAmount >= monthlyFee.totalAmount
      ) {
        await this.applyAdvanceToMonth(studentId, month, year, adminId);
        monthlyFee = await StudentMonthlyFee.findById(monthlyFee._id);
      }
    }

    return monthlyFee;
  }

  static async markAsPaid(studentId, month, year, paymentData, adminId) {
    // Ensure the fee record exists, create if not found
    let monthlyFee = await this.ensureMonthlyFeeExists(
      studentId,
      month,
      year,
      adminId,
    );

    if (monthlyFee.locked) {
      throw new ApiError(400, "This month is locked and cannot be modified");
    }

    // Update fee record
    monthlyFee.status = "PAID";
    monthlyFee.paymentDate = new Date();
    monthlyFee.paymentMethod = paymentData.method;
    monthlyFee.transactionId = paymentData.transactionId;
    monthlyFee.remarks = paymentData.remarks;
    monthlyFee.locked = true;
    monthlyFee.updatedBy = adminId;

    await monthlyFee.save();

    // Resolve any due records for this month
    await DueRecord.updateMany(
      {
        studentId,
        monthsDue: { $in: [`${year}-${String(month + 1).padStart(2, "0")}`] },
        resolved: false,
      },
      {
        $set: {
          resolved: true,
          resolutionDate: new Date(),
          resolvedBy: adminId,
        },
      },
    );

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "MARK_PAID",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      oldValue: { status: monthlyFee.status },
      newValue: {
        status: "PAID",
        paymentData,
        locked: true,
      },
      ipAddress: paymentData.ipAddress,
      userAgent: paymentData.userAgent,
      metadata: { studentId, month, year },
    });

    return monthlyFee;
  }

  /**
   * Mark fee as due
   */
  static async markAsDue(studentId, month, year, reminderDate, adminId) {
    // Ensure the fee record exists, create if not found
    let monthlyFee = await this.ensureMonthlyFeeExists(
      studentId,
      month,
      year,
      adminId,
    );

    if (monthlyFee.locked) {
      throw new ApiError(400, "This month is locked and cannot be modified");
    }

    // Update fee record
    monthlyFee.status = "DUE";
    monthlyFee.updatedBy = adminId;
    await monthlyFee.save();

    // Create or update due record
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    let dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    });

    if (dueRecord) {
      // Add to existing due record
      if (!dueRecord.monthsDue.includes(monthKey)) {
        dueRecord.monthsDue.push(monthKey);
        dueRecord.totalDueAmount += monthlyFee.totalAmount;
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

    // Create admin reminder for due student
    try {
      const AdminReminderService = (await import("./adminReminder.service.js"))
        .default;
      await AdminReminderService.createDueStudentReminder(
        studentId,
        dueRecord._id,
        adminId,
      );
    } catch (error) {
      console.error("Error creating admin reminder:", error);
      // Don't throw - just log
    }

    return { monthlyFee, dueRecord };
  }

  /**
   * Add advance payment
   */
  static async addAdvance(studentId, amount, adminId) {
    let advanceBalance = await AdvanceBalance.findOne({ studentId });

    if (advanceBalance) {
      await advanceBalance.addAdvance(amount, adminId);
    } else {
      advanceBalance = await AdvanceBalance.create({
        studentId,
        totalAmount: amount,
        remainingAmount: amount,
        monthsCovered: [],
        createdBy: adminId,
      });
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "ADD_ADVANCE",
      targetEntity: "FEE",
      targetId: advanceBalance._id,
      newValue: { amount, studentId },
      metadata: { studentId },
    });

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

    // Apply advance
    await advanceBalance.applyToMonth(month, year, monthlyFee.totalAmount);

    // Update fee record
    monthlyFee.status = "PAID";
    monthlyFee.coveredByAdvance = true;
    monthlyFee.paymentDate = new Date();
    monthlyFee.locked = true;
    monthlyFee.updatedBy = adminId;
    await monthlyFee.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "APPLY_ADVANCE",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      oldValue: { status: monthlyFee.status, coveredByAdvance: false },
      newValue: {
        status: "PAID",
        coveredByAdvance: true,
        paymentDate: new Date(),
      },
      metadata: { studentId, month, year, amount: monthlyFee.totalAmount },
    });

    return { monthlyFee, advanceBalance };
  }

  /**
   * Get student fee summary
   */
  static async getStudentFeeSummary(studentId) {
    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const monthlyFees = await StudentMonthlyFee.find({ studentId })
      .sort({ year: -1, month: -1 })
      .limit(12);

    const advanceBalance = await AdvanceBalance.findOne({ studentId });
    const dueRecord = await DueRecord.findOne({ studentId, resolved: false });

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
      feeHistory: monthlyFees.map((fee) => ({
        month: fee.month,
        year: fee.year,
        baseFee: fee.baseFee,
        dueCarriedForward: fee.dueCarriedForwardAmount,
        totalAmount: fee.totalAmount,
        status: fee.status,
        coveredByAdvance: fee.coveredByAdvance,
        locked: fee.locked,
        paymentDate: fee.paymentDate,
      })),
      advance: advanceBalance
        ? {
            totalAmount: advanceBalance.totalAmount,
            remainingAmount: advanceBalance.remainingAmount,
            monthsCovered: advanceBalance.monthsCovered,
            lastAppliedMonth: advanceBalance.lastAppliedMonth,
          }
        : null,
      due: dueRecord
        ? {
            monthsDue: dueRecord.monthsDue,
            totalDueAmount: dueRecord.totalDueAmount,
            reminderDate: dueRecord.reminderDate,
          }
        : null,
      totals: {
        totalPaid: monthlyFees
          .filter((f) => f.status === "PAID")
          .reduce((sum, f) => sum + f.totalAmount, 0),
        totalDue: monthlyFees
          .filter((f) => f.status === "DUE")
          .reduce((sum, f) => sum + f.totalAmount, 0),
        totalPending: monthlyFees
          .filter((f) => f.status === "PENDING")
          .reduce((sum, f) => sum + f.totalAmount, 0),
      },
    };

    return summary;
  }

  /**
   * Calculate payment status for dashboard
   */
  static async getDashboardPaymentStatus(month, year) {
    const monthlyFees = await StudentMonthlyFee.find({
      month,
      year,
    }).populate("studentId", "name status");

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
}

export default FeeService;
