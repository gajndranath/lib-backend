import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { Reminder } from "../models/reminder.model.js";
import { ApiError } from "../utils/ApiError.js";
import { PAYMENT_GRACE_PERIOD, ReminderType } from "../constants/constants.js";

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

      // Carry forward if previous month has unpaid dues
      if (previousFee) {
        if (previousFee.status === "DUE") {
          // Full unpaid month
          dueCarriedForward =
            previousFee.baseFee + previousFee.dueCarriedForwardAmount;
        } else if (previousFee.status === "PAID" && previousFee.paidAmount) {
          // Partial payment - carry forward the unpaid portion
          const unpaidAmount =
            Math.round(
              (previousFee.totalAmount - previousFee.paidAmount) * 100,
            ) / 100;
          if (unpaidAmount > 0) {
            dueCarriedForward = unpaidAmount;
          }
        }
      }

      // Also check for unresolved due records to ensure cumulative tracking
      const unresolvedDue = await DueRecord.findOne({
        studentId,
        resolved: false,
      });

      if (unresolvedDue && unresolvedDue.totalDueAmount > 0) {
        // Add any additional unresolved dues
        dueCarriedForward =
          Math.round((dueCarriedForward + unresolvedDue.totalDueAmount) * 100) /
          100;
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

    // Get the paid amount, default to total if not specified
    const paidAmount = paymentData.amount || monthlyFee.totalAmount;
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

    // Update fee record
    monthlyFee.status = "PAID";
    monthlyFee.paymentDate = new Date();
    monthlyFee.paymentMethod = paymentData.method;
    monthlyFee.transactionId = paymentData.transactionId;
    monthlyFee.remarks = paymentData.remarks;
    monthlyFee.paidAmount = paidAmount;
    monthlyFee.locked = true;
    monthlyFee.updatedBy = adminId;

    await monthlyFee.save();

    // Calculate due amount if payment is partial
    const dueAmount =
      Math.round((monthlyFee.totalAmount - paidAmount) * 100) / 100;

    // If partial payment, create/update due record with remaining amount
    if (dueAmount > 0) {
      let dueRecord = await DueRecord.findOne({
        studentId,
        resolved: false,
      });

      if (dueRecord) {
        // Add to existing due record if not already there
        if (!dueRecord.monthsDue.includes(monthKey)) {
          dueRecord.monthsDue.push(monthKey);
          dueRecord.totalDueAmount =
            Math.round((dueRecord.totalDueAmount + dueAmount) * 100) / 100;
          await dueRecord.save();
        } else {
          // Month already exists in due record - update the amount
          // This handles the case where admin corrects a previous partial payment
          dueRecord.totalDueAmount =
            Math.round((dueRecord.totalDueAmount + dueAmount) * 100) / 100;
          await dueRecord.save();
        }
      } else {
        // Create new due record
        dueRecord = await DueRecord.create({
          studentId,
          monthsDue: [monthKey],
          totalDueAmount: dueAmount,
          reminderDate: new Date(),
          createdBy: adminId,
        });
      }
    } else {
      // Full payment - resolve any due records for this month only if no other dues exist
      const currentDue = await DueRecord.findOne({
        studentId,
        resolved: false,
      });

      if (currentDue) {
        // Remove this month from due list
        currentDue.monthsDue = currentDue.monthsDue.filter(
          (m) => m !== monthKey,
        );

        // Recalculate total due amount from remaining months
        if (currentDue.monthsDue.length === 0) {
          // No more due months - resolve the record
          currentDue.resolved = true;
          currentDue.resolutionDate = new Date();
          currentDue.resolvedBy = adminId;
          await currentDue.save();

          // Resolve any DUE reminders for this student
          await Reminder.updateMany(
            { studentId, type: ReminderType.DUE, resolved: false },
            { $set: { resolved: true } },
          );
        } else {
          // Still has other due months - just save the updated list
          await currentDue.save();
        }
      }
    }

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "MARK_PAID",
      targetEntity: "FEE",
      targetId: monthlyFee._id,
      oldValue: { status: monthlyFee.status, amount: monthlyFee.totalAmount },
      newValue: {
        status: "PAID",
        paidAmount,
        dueAmount,
        paymentData,
        locked: true,
      },
      ipAddress: paymentData.ipAddress,
      userAgent: paymentData.userAgent,
      metadata: { studentId, month, year, dueAmount },
    });

    return { monthlyFee, dueAmount };
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

    // Resolve any DUE reminders for this student
    await Reminder.updateMany(
      { studentId, type: ReminderType.DUE, resolved: false },
      { $set: { resolved: true } },
    );

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

  /**
   * Generate fee for students whose billing date is today or overdue
   * This runs daily and creates fees based on individual student billing cycles
   */
  static async generatePersonalizedFees(adminId = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find active students whose nextBillingDate is today or earlier
    const studentsDue = await Student.find({
      status: "ACTIVE",
      isDeleted: false,
      nextBillingDate: { $lte: today },
    });

    const results = {
      generated: 0,
      skipped: 0,
      errors: [],
      studentsProcessed: [],
    };

    for (const student of studentsDue) {
      try {
        const billingDate = new Date(student.nextBillingDate);
        const month = billingDate.getMonth();
        const year = billingDate.getFullYear();

        // Check if fee already exists for this billing cycle
        const existingFee = await StudentMonthlyFee.findOne({
          studentId: student._id,
          month,
          year,
        });

        if (existingFee) {
          results.skipped++;
          continue;
        }

        // Get previous billing cycle fee
        const previousBillingDate = new Date(billingDate);
        previousBillingDate.setMonth(previousBillingDate.getMonth() - 1);
        const prevMonth = previousBillingDate.getMonth();
        const prevYear = previousBillingDate.getFullYear();

        const previousFee = await StudentMonthlyFee.findOne({
          studentId: student._id,
          month: prevMonth,
          year: prevYear,
        });

        let dueCarriedForward = 0;

        // Carry forward unpaid dues
        if (previousFee) {
          if (previousFee.status === "DUE") {
            // Full unpaid month
            dueCarriedForward =
              previousFee.baseFee + previousFee.dueCarriedForwardAmount;
          } else if (previousFee.status === "PAID" && previousFee.paidAmount) {
            // Partial payment - carry forward unpaid portion
            const unpaidAmount =
              Math.round(
                (previousFee.totalAmount - previousFee.paidAmount) * 100,
              ) / 100;
            if (unpaidAmount > 0) {
              dueCarriedForward = unpaidAmount;
            }
          }
        }

        // Check for unresolved due records
        const unresolvedDue = await DueRecord.findOne({
          studentId: student._id,
          resolved: false,
        });

        if (unresolvedDue && unresolvedDue.totalDueAmount > 0) {
          dueCarriedForward =
            Math.round(
              (dueCarriedForward + unresolvedDue.totalDueAmount) * 100,
            ) / 100;
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

        // Update student's next billing date
        const nextBilling = new Date(billingDate);
        nextBilling.setMonth(nextBilling.getMonth() + 1);

        // Handle months with fewer days
        const maxDayInNextMonth = new Date(
          nextBilling.getFullYear(),
          nextBilling.getMonth() + 1,
          0,
        ).getDate();

        if (student.billingDay > maxDayInNextMonth) {
          nextBilling.setDate(maxDayInNextMonth);
        } else {
          nextBilling.setDate(student.billingDay);
        }

        student.nextBillingDate = nextBilling;
        await student.save();

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
        results.studentsProcessed.push({
          studentId: student._id,
          name: student.name,
          billingDate: billingDate,
          nextBillingDate: nextBilling,
          totalDue: monthlyFee.totalAmount,
        });
      } catch (error) {
        results.errors.push({
          student: student.name,
          error: error.message,
        });
      }
    }

    // Log the action if fees were generated
    if (results.generated > 0 && adminId) {
      await AdminActionLog.create({
        adminId,
        action: "GENERATE_PERSONALIZED_FEES",
        targetEntity: "SYSTEM",
        targetId: adminId,
        newValue: { results },
        ipAddress: "SYSTEM",
        userAgent: "SYSTEM",
      });
    }

    return results;
  }

  /**
   * Get students whose payment is due (billing date passed + grace period)
   * Used for sending reminders to admin
   */
  static async getStudentsWithOverduePayments(graceDays = 1) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const graceDate = new Date(today);
    graceDate.setDate(graceDate.getDate() - graceDays);

    // Find students with pending fees whose billing date + grace has passed
    const overdueStudents = await Student.aggregate([
      {
        $match: {
          status: "ACTIVE",
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "studentmonthlyfees",
          let: { studentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$studentId", "$$studentId"] },
                status: "PENDING",
              },
            },
            { $sort: { year: -1, month: -1 } },
            { $limit: 1 },
          ],
          as: "latestPendingFee",
        },
      },
      {
        $unwind: {
          path: "$latestPendingFee",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $addFields: {
          feeDate: {
            $dateFromParts: {
              year: "$latestPendingFee.year",
              month: { $add: ["$latestPendingFee.month", 1] },
              day: "$billingDay",
            },
          },
        },
      },
      {
        $match: {
          feeDate: { $lte: graceDate },
        },
      },
      {
        $lookup: {
          from: "duerecords",
          let: { studentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$studentId", "$$studentId"] },
                resolved: false,
              },
            },
          ],
          as: "dueRecord",
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          email: 1,
          billingDay: 1,
          nextBillingDate: 1,
          pendingFee: "$latestPendingFee",
          dueRecord: { $arrayElemAt: ["$dueRecord", 0] },
          daysPastDue: {
            $dateDiff: {
              startDate: "$feeDate",
              endDate: today,
              unit: "day",
            },
          },
        },
      },
    ]);

    return overdueStudents;
  }

  /**
   * Auto-mark pending fees as DUE after grace period
   */
  static async autoMarkOverdueAsDue(graceDays = 1, adminId = null) {
    const overdueStudents =
      await this.getStudentsWithOverduePayments(graceDays);

    const results = {
      markedDue: 0,
      errors: [],
    };

    for (const student of overdueStudents) {
      try {
        if (student.pendingFee) {
          await this.markAsDue(
            student._id,
            student.pendingFee.month,
            student.pendingFee.year,
            new Date(),
            adminId,
          );
          results.markedDue++;
        }
      } catch (error) {
        results.errors.push({
          student: student.name,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Generate receipt for a paid fee
   */
  static async generateReceipt(studentId, month, year) {
    const monthlyFee = await StudentMonthlyFee.findOne({
      studentId,
      month,
      year,
    }).populate("studentId", "name phoneNumber email");

    if (!monthlyFee) {
      throw new ApiError(404, "Fee record not found");
    }

    if (monthlyFee.status !== "PAID") {
      throw new ApiError(400, "Receipt can only be generated for paid fees");
    }

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const receiptNumber = `RCP-${monthlyFee._id
      .toString()
      .slice(-8)
      .toUpperCase()}`;
    const monthYear = `${monthNames[month]} ${year}`;

    return {
      receiptNumber,
      studentName: monthlyFee.studentId.name,
      studentPhone: monthlyFee.studentId.phoneNumber,
      monthYear,
      amount: monthlyFee.paidAmount || monthlyFee.totalAmount,
      paymentDate: monthlyFee.paymentDate,
      paymentMethod: monthlyFee.paymentMethod || "Not specified",
      transactionId: monthlyFee.transactionId || null,
      remarks: monthlyFee.remarks || null,
    };
  }

  /**
   * Get receipt HTML for PDF generation
   */
  static async getReceiptHTML(studentId, month, year) {
    const receipt = await this.generateReceipt(studentId, month, year);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .receipt { max-width: 600px; border: 1px solid #ddd; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h2 { margin: 0; color: #333; }
          .receipt-number { text-align: center; color: #666; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          .row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: 500; color: #666; }
          .value { text-align: right; }
          .total { border-top: 2px solid #333; padding-top: 10px; font-size: 16px; font-weight: bold; }
          .footer { text-align: center; color: #999; margin-top: 30px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h2>Payment Receipt</h2>
            <p style="margin: 5px 0; color: #666;">Library System</p>
          </div>
          
          <div class="receipt-number">
            Receipt #: ${receipt.receiptNumber}
          </div>
          
          <div class="section">
            <div class="section-title">Student Information</div>
            <div class="row">
              <span class="label">Name:</span>
              <span class="value">${receipt.studentName}</span>
            </div>
            <div class="row">
              <span class="label">Phone:</span>
              <span class="value">${receipt.studentPhone}</span>
            </div>
          </div>
          
          <div class="section">
            <div class="section-title">Payment Details</div>
            <div class="row">
              <span class="label">Month:</span>
              <span class="value">${receipt.monthYear}</span>
            </div>
            <div class="row">
              <span class="label">Amount:</span>
              <span class="value">₹${receipt.amount.toFixed(2)}</span>
            </div>
            <div class="row">
              <span class="label">Payment Date:</span>
              <span class="value">${new Date(receipt.paymentDate).toLocaleDateString()}</span>
            </div>
            <div class="row">
              <span class="label">Payment Method:</span>
              <span class="value">${receipt.paymentMethod}</span>
            </div>
            ${
              receipt.transactionId
                ? `
            <div class="row">
              <span class="label">Transaction ID:</span>
              <span class="value">${receipt.transactionId}</span>
            </div>
            `
                : ""
            }
            ${
              receipt.remarks
                ? `
            <div class="row">
              <span class="label">Remarks:</span>
              <span class="value">${receipt.remarks}</span>
            </div>
            `
                : ""
            }
          </div>
          
          <div class="footer">
            <p>This is a computer-generated receipt. No signature required.</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }
}

export default FeeService;
