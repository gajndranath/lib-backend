import { Ledger } from "../models/ledger.model.js";
import { Student } from "../models/student.model.js";
import { ApiError } from "../utils/ApiError.js";
import { PaymentStatus } from "../constants/constants.js";

class LedgerService {
  static async generateMonthlyInvoices() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentDay = today.getDate();

    console.log(
      `Generating invoices for ${currentDay}/${currentMonth + 1}/${currentYear}`
    );

    // Find students whose billing day is today
    const students = await Student.find({
      billingDay: currentDay,
      status: "ACTIVE",
      isDeleted: false,
    });

    let generatedCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      try {
        // Check if invoice already exists for this month
        const existingLedger = await Ledger.findOne({
          studentId: student._id,
          billingMonth: currentMonth,
          billingYear: currentYear,
        });

        if (existingLedger) {
          skippedCount++;
          continue;
        }

        // Get last month's pending amount
        let previousMonth = currentMonth - 1;
        let previousYear = currentYear;

        if (previousMonth < 0) {
          previousMonth = 11;
          previousYear--;
        }

        const lastLedger = await Ledger.findOne({
          studentId: student._id,
          billingMonth: previousMonth,
          billingYear: previousYear,
        }).sort({ createdAt: -1 });

        let carryForwardAmount = 0;
        let remarks = "";

        if (lastLedger && lastLedger.paymentStatus !== PaymentStatus.PAID) {
          carryForwardAmount = lastLedger.dueAmount - lastLedger.paidAmount;
          if (carryForwardAmount > 0) {
            remarks = `Carry forward from ${lastLedger.monthName} ${lastLedger.billingYear}`;
          }
        }

        // Create new ledger entry
        await Ledger.create({
          studentId: student._id,
          billingMonth: currentMonth,
          billingYear: currentYear,
          dueAmount: student.monthlyFees + carryForwardAmount,
          carryForwardAmount,
          remarks,
          paymentStatus: PaymentStatus.UNPAID,
        });

        generatedCount++;
        console.log(
          `Generated invoice for ${student.name}: ₹${student.monthlyFees} + ₹${carryForwardAmount} carry forward`
        );
      } catch (error) {
        console.error(
          `Error generating invoice for ${student.name}:`,
          error.message
        );
      }
    }

    return {
      generated: generatedCount,
      skipped: skippedCount,
      totalStudents: students.length,
      date: today.toISOString(),
    };
  }

  static async togglePaymentStatus(studentId, month, year, isPaid, amount) {
    const ledger = await Ledger.findOne({
      studentId,
      billingMonth: month,
      billingYear: year,
    });

    if (!ledger)
      throw new ApiError(404, "Ledger record not found for this month");

    ledger.paymentStatus = isPaid ? PaymentStatus.PAID : PaymentStatus.UNPAID;

    if (isPaid) {
      ledger.paidAmount = amount || ledger.dueAmount;
      ledger.paymentDate = new Date();
    } else {
      ledger.paidAmount = 0;
      ledger.paymentDate = null;
    }

    await ledger.save();
    return ledger;
  }

  static async processPartialPayment(
    studentId,
    month,
    year,
    amount,
    remarks = ""
  ) {
    const ledger = await Ledger.findOne({
      studentId,
      billingMonth: month,
      billingYear: year,
    });

    if (!ledger) throw new ApiError(404, "Ledger record not found");

    if (amount > ledger.dueAmount) {
      throw new ApiError(400, "Payment amount exceeds due amount");
    }

    ledger.paidAmount = (ledger.paidAmount || 0) + amount;
    ledger.paymentDate = new Date();

    if (ledger.paidAmount >= ledger.dueAmount) {
      ledger.paymentStatus = PaymentStatus.PAID;
    } else if (ledger.paidAmount > 0) {
      ledger.paymentStatus = PaymentStatus.PARTIAL;
    }

    if (remarks) {
      ledger.remarks = remarks;
    }

    await ledger.save();
    return ledger;
  }

  static async getStudentPaymentSummary(studentId) {
    const ledgers = await Ledger.find({ studentId })
      .sort({ billingYear: -1, billingMonth: -1 })
      .limit(6);

    const totalPaid = ledgers.reduce(
      (sum, ledger) => sum + (ledger.paidAmount || 0),
      0
    );
    const totalDue = ledgers.reduce(
      (sum, ledger) => sum + (ledger.dueAmount || 0),
      0
    );
    const pendingAmount = totalDue - totalPaid;

    const paymentHistory = ledgers.map((ledger) => ({
      month: ledger.monthName,
      year: ledger.billingYear,
      dueAmount: ledger.dueAmount,
      paidAmount: ledger.paidAmount,
      status: ledger.paymentStatus,
      paymentDate: ledger.paymentDate,
    }));

    return {
      totalPaid,
      totalDue,
      pendingAmount,
      paymentHistory,
      lastPayment: ledgers.find((l) => l.paymentDate)?.paymentDate || null,
    };
  }
}

export default LedgerService;
