/**
 * Fee Generation Service
 * Handles monthly fee creation and personalized billing cycles
 */

import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import {
  calculateDueCarryForward,
  calculateNextBillingDate,
  getFeeRecordForMonth,
  isOverdue,
} from "../utils/feeHelpers.js";
import FeeAdvanceService from "./feeAdvance.service.js";

class FeeGenerationService {
  /**
   * Generate monthly fee record for all active students
   * Legacy monthly generation (runs on 1st of every month)
   * OPTIMIZED: Batch queries to avoid N+1 problems
   */
  static async generateMonthlyFees(month, year, adminId) {
    // Batch fetch all active students (lean for read-only)
    const activeStudents = await Student.find({
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id monthlyFee joiningDate")
      .lean();

    // Batch fetch all existing fee records for this month/year to avoid repeated queries
    const existingFees = await StudentMonthlyFee.find({
      month,
      year,
      studentId: { $in: activeStudents.map((s) => s._id) },
    })
      .select("studentId")
      .lean();

    const existingFeeSet = new Set(
      existingFees.map((f) => f.studentId.toString()),
    );

    const results = {
      generated: 0,
      skipped: 0,
      errors: [],
    };

    for (const student of activeStudents) {
      try {
        // Check if fee record already exists (using pre-fetched set)
        if (existingFeeSet.has(student._id.toString())) {
          results.skipped++;
          continue;
        }

        // Calculate due carry forward using helper (optimized to batch later)
        const dueCarriedForward = await calculateDueCarryForward(
          student._id,
          month,
          year,
        );

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
        const advanceCovered = await FeeAdvanceService.applyAdvanceIfAvailable(
          student._id,
          month,
          year,
          monthlyFee.totalAmount,
          adminId,
        );

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
   * Ensure monthly fee record exists, create if not found
   * Used by payment and other services
   */
  static async ensureMonthlyFeeExists(studentId, month, year, adminId) {
    let monthlyFee = await getFeeRecordForMonth(studentId, month, year);

    if (!monthlyFee) {
      // Check if student exists and is active
      const student = await Student.findById(studentId);
      if (!student) {
        throw new ApiError(404, "Student not found");
      }

      // Calculate due carry forward using helper
      const dueCarriedForward = await calculateDueCarryForward(
        studentId,
        month,
        year,
      );

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
      await FeeAdvanceService.applyAdvanceIfAvailable(
        studentId,
        month,
        year,
        monthlyFee.totalAmount,
        adminId,
      );

      // Reload to get updated status if advance was applied
      monthlyFee = await StudentMonthlyFee.findById(monthlyFee._id);
    }

    return monthlyFee;
  }

  /**
   * Generate fee for students whose billing date is today or overdue
   * This runs daily and creates fees based on individual student billing cycles
   */
  static async generatePersonalizedFees(adminId = null, studentId = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const graceDays = parseInt(process.env.PAYMENT_GRACE_PERIOD) || 1;

    // Build filter
    const filter = {
      status: "ACTIVE",
      isDeleted: false,
      nextBillingDate: { $lte: today },
    };

    if (studentId) {
      filter._id = studentId;
    }

    // Find active students whose nextBillingDate is today or earlier
    const studentsDue = await Student.find(filter);

    const results = {
      generated: 0,
      skipped: 0,
      errors: [],
      studentsProcessed: [],
    };

    for (const student of studentsDue) {
      try {
        // While the student's nextBillingDate is today or earlier, continue generating fees
        // This handles "catch-up" if a student joined months ago
        while (student.nextBillingDate <= today) {
          const billingDate = new Date(student.nextBillingDate);
          const month = billingDate.getMonth();
          const year = billingDate.getFullYear();

          // Check if fee already exists for this billing cycle
          const existingFee = await getFeeRecordForMonth(
            student._id,
            month,
            year,
          );

          if (!existingFee) {
            // Check if this new fee is already overdue
            const overdue = isOverdue(billingDate, graceDays);
            const status = overdue ? "DUE" : "PENDING";

            // Calculate due carry forward using helper
            const dueCarriedForward = await calculateDueCarryForward(
              student._id,
              month,
              year,
            );

            // Create monthly fee record
            const monthlyFee = await StudentMonthlyFee.create({
              studentId: student._id,
              month,
              year,
              baseFee: student.monthlyFee,
              dueCarriedForwardAmount: dueCarriedForward,
              status,
              createdBy: adminId,
              tenantId: student.tenantId,
            });

            // If it's DUE, we also need to create/update a DueRecord
            if (overdue) {
              const FeeDueService = (await import("./feeDue.service.js")).default;
              // We use a helper-like logic to ensure DueRecord is synced
              // markAsDue also creates a reminder, which is good for senior SaaS
              await FeeDueService.markAsDue(
                student._id,
                month,
                year,
                new Date(),
                adminId,
              );
            }

            // Check if advance covers this month
            // (Only if it wasn't already marked as DUE/Paid by markAsDue)
            const currentFee = await StudentMonthlyFee.findById(monthlyFee._id);
            if (currentFee.status === "PENDING") {
              await FeeAdvanceService.applyAdvanceIfAvailable(
                student._id,
                month,
                year,
                currentFee.totalAmount,
                adminId,
              );
            }

            results.generated++;
            results.studentsProcessed.push({
              studentId: student._id,
              name: student.name,
              month,
              year,
              status: overdue ? "DUE" : "PENDING",
              billingDate: billingDate,
              totalDue: currentFee.totalAmount,
            });
          } else {
            results.skipped++;
          }

          // Update student's next billing date using helper
          const nextBilling = calculateNextBillingDate(
            student.billingDay,
            billingDate,
          );
          student.nextBillingDate = nextBilling;
          
          // If the next billing date is still in the past, we'll loop again
        }
        
        // Save the student once after all catch-up billing is done
        await student.save();
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

    // Find students with PENDING fees past grace period
    const overdueStudents = await Student.aggregate([
      {
        $match: {
          status: "ACTIVE",
          isDeleted: false,
          nextBillingDate: { $lte: graceDate },
        },
      },
      {
        $lookup: {
          from: "studentmonthlyfees",
          let: { studentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$studentId", "$$studentId"] },
                    { $eq: ["$status", "PENDING"] },
                  ],
                },
              },
            },
            { $sort: { year: -1, month: -1 } },
            { $limit: 1 },
          ],
          as: "pendingFee",
        },
      },
      {
        $match: {
          pendingFee: { $ne: [] },
        },
      },
    ]);

    return overdueStudents;
  }

  /**
   * Auto-mark pending fees as DUE after grace period
   * Runs daily via cron job
   */
  static async autoMarkOverdueAsDue(graceDays = 1, adminId = null) {
    const overdueStudents =
      await this.getStudentsWithOverduePayments(graceDays);

    const results = {
      marked: 0,
      errors: [],
    };

    for (const student of overdueStudents) {
      try {
        const pendingFee = student.pendingFee[0];

        if (pendingFee) {
          // Mark as DUE (will be handled by FeeDue service)
          const FeeDueService = (await import("./feeDue.service.js")).default;
          await FeeDueService.markAsDue(
            student._id,
            pendingFee.month,
            pendingFee.year,
            new Date(),
            adminId,
          );

          results.marked++;
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
}

export default FeeGenerationService;
