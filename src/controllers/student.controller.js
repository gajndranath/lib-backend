import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import StudentService from "../services/student.service.js";
import FeeService from "../services/fee.service.js";
import StudentNotificationService from "../services/studentNotification.service.js";
import { studentRegistrationSchema } from "../utils/validators.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import {
  getDaysOverdue,
  getFeeDueDate,
  getMonthName,
} from "../utils/feeHelpers.js";

export const registerStudent = asyncHandler(async (req, res) => {
  // Validate input
  const validation = studentRegistrationSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const student = await StudentService.registerStudent(
    validation.data,
    req.admin._id,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, student, "Student registered successfully"));
});

export const updateStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const updateData = req.body;

  const student = await StudentService.updateStudent(
    studentId,
    updateData,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Student updated successfully"));
});

export const archiveStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { reason } = req.body;

  const student = await StudentService.archiveStudent(
    studentId,
    reason,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Student archived successfully"));
});

export const reactivateStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await StudentService.reactivateStudent(
    studentId,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Student reactivated successfully"));
});

export const getStudentDetails = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const studentDetails = await StudentService.getStudentDetails(studentId);

  return res
    .status(200)
    .json(new ApiResponse(200, studentDetails, "Student details fetched"));
});

export const searchStudents = asyncHandler(async (req, res) => {
  const { query, page = 1, limit = 20 } = req.query;

  const result = await StudentService.searchStudents(
    { search: query, ...req.query },
    parseInt(page),
    parseInt(limit),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Students search results"));
});

export const getStudentsBySlot = asyncHandler(async (req, res) => {
  const { slotId } = req.params;
  const { status } = req.query;

  const students = await StudentService.getStudentsBySlot(slotId, status);

  return res
    .status(200)
    .json(new ApiResponse(200, students, "Students by slot fetched"));
});

export const markFeeAsPaid = asyncHandler(async (req, res) => {
  const { studentId, month, year } = req.params;
  const paymentData = req.body;

  const result = await FeeService.markAsPaid(
    studentId,
    parseInt(month),
    parseInt(year),
    {
      ...paymentData,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    },
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Fee marked as paid successfully"));
});

export const markFeeAsDue = asyncHandler(async (req, res) => {
  const { studentId, month, year } = req.params;
  const { reminderDate } = req.body;

  const result = await FeeService.markAsDue(
    studentId,
    parseInt(month),
    parseInt(year),
    new Date(reminderDate),
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Fee marked as due successfully"));
});

export const addAdvance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { amount } = req.body;

  const advanceBalance = await FeeService.addAdvance(
    studentId,
    amount,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, advanceBalance, "Advance added successfully"));
});

export const applyAdvance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { month, year, amount } = req.body;

  const result = await FeeService.applyAdvanceToMonth(
    studentId,
    parseInt(month),
    parseInt(year),
    req.admin._id,
    amount,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Advance applied successfully"));
});

export const getFeeSummary = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const summary = await FeeService.getStudentFeeSummary(studentId);

  return res
    .status(200)
    .json(new ApiResponse(200, summary, "Fee summary fetched"));
});

export const getDashboardPaymentStatus = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const currentDate = new Date();
  const targetMonth = month ? parseInt(month) : currentDate.getMonth();
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();

  const status = await FeeService.getDashboardPaymentStatus(
    targetMonth,
    targetYear,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, status, "Payment status fetched"));
});

export const changeStudentSlot = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { newSlotId, reason = "" } = req.body;

  const result = await SlotService.changeStudentSlot(
    studentId,
    newSlotId,
    req.admin._id,
    reason,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Student slot changed successfully"));
});

export const getStudentSlotHistory = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const history = await SlotService.getStudentSlotHistory(studentId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        history,
        "Student slot history fetched successfully",
      ),
    );
});

export const getPendingSlotChangeRequests = asyncHandler(async (req, res) => {
  const requests = await SlotService.getPendingSlotRequests();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        requests,
        "Pending slot change requests fetched successfully",
      ),
    );
});

export const approveSlotChangeRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const result = await SlotService.approveSlotChangeRequest(
    requestId,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Slot change request approved"));
});

export const rejectSlotChangeRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { reason = "" } = req.body;

  const result = await SlotService.rejectSlotChangeRequest(
    requestId,
    req.admin._id,
    reason,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Slot change request rejected"));
});

export const overrideStudentFee = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { newMonthlyFee, reason } = req.body;

  const student = await StudentService.overrideStudentFee(
    studentId,
    newMonthlyFee,
    reason,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Student fee overridden successfully"));
});
// Save student push subscription for notifications
export const savePushSubscription = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { subscription, type = "web", deviceInfo = {} } = req.body;

  const student = await StudentNotificationService.savePushSubscription(
    studentId,
    subscription,
    type,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Subscription saved successfully"));
});

// Remove student push subscription
export const removePushSubscription = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { type = "web" } = req.body;

  const student = await StudentNotificationService.removePushSubscription(
    studentId,
    type,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Subscription removed successfully"));
});

// Get receipt details (admin)
export const getReceiptDetails = asyncHandler(async (req, res) => {
  const { studentId, month, year } = req.params;

  const receipt = await FeeService.generateReceipt(
    studentId,
    parseInt(month),
    parseInt(year),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, receipt, "Receipt generated successfully"));
});

// Download receipt PDF (admin)
export const downloadReceiptPDF = asyncHandler(async (req, res) => {
  const { studentId, month, year } = req.params;

  const html = await FeeService.getReceiptHTML(
    studentId,
    parseInt(month),
    parseInt(year),
  );

  // Send HTML for PDF generation (can be handled by client with html2pdf)
  res.setHeader("Content-Type", "text/html");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="receipt-${studentId}-${month}-${year}.html"`,
  );
  res.send(html);
});

// ✅ Get full year fee calendar for a student
export const getStudentFeeCalendar = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { year } = req.query;

  const targetYear = year ? parseInt(year) : new Date().getFullYear();

  // Fetch all fee records for this student in the target year
  const fees = await StudentMonthlyFee.find({
    studentId,
    year: targetYear,
  })
    .sort({ month: 1 })
    .lean({ getters: true });

  // Build a map keyed by month index (0-11)
  const feeMap = new Map(fees.map((f) => [f.month, f]));

  // Build 12-month calendar grid
  const calendar = Array.from({ length: 12 }, (_, monthIndex) => {
    const fee = feeMap.get(monthIndex);
    if (fee) {
      const total = (fee.baseFee || 0) + (fee.dueCarriedForwardAmount || 0);
      return {
        month: monthIndex,
        year: targetYear,
        label: `${getMonthName(monthIndex)} ${targetYear}`,
        hasRecord: true,
        status: fee.status,
        baseFee: fee.baseFee || 0,
        dueCarriedForward: fee.dueCarriedForwardAmount || 0,
        totalAmount: total,
        paidAmount: fee.paidAmount || 0,
        remainingAmount: Math.max(0, total - (fee.paidAmount || 0)),
        paymentDate: fee.paymentDate || null,
        paymentMethod: fee.paymentMethod || null,
        transactionId: fee.transactionId || null,
        remarks: fee.remarks || null,
        coveredByAdvance: fee.coveredByAdvance || false,
        locked: fee.locked || false,
        feeDueDate: getFeeDueDate(monthIndex, targetYear),
        daysOverdue: getDaysOverdue(monthIndex, targetYear, fee.status),
      };
    }
    return {
      month: monthIndex,
      year: targetYear,
      label: `${getMonthName(monthIndex)} ${targetYear}`,
      hasRecord: false,
      status: "NO_RECORD",
      baseFee: 0,
      dueCarriedForward: 0,
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      paymentDate: null,
      paymentMethod: null,
      transactionId: null,
      remarks: null,
      coveredByAdvance: false,
      locked: false,
      feeDueDate: getFeeDueDate(monthIndex, targetYear),
      daysOverdue: 0,
    };
  });

  // Summary for the year
  const recordedFees = calendar.filter((c) => c.hasRecord);
  const summary = {
    year: targetYear,
    totalPaid: recordedFees.reduce((s, c) => s + c.paidAmount, 0),
    totalDue: recordedFees
      .filter((c) => c.status === "DUE")
      .reduce((s, c) => s + c.remainingAmount, 0),
    totalPending: recordedFees
      .filter((c) => c.status === "PENDING")
      .reduce((s, c) => s + c.totalAmount, 0),
    paidMonths: recordedFees.filter((c) => c.status === "PAID").length,
    dueMonths: recordedFees.filter((c) => c.status === "DUE").length,
    pendingMonths: recordedFees.filter((c) => c.status === "PENDING").length,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { calendar, summary, year: targetYear },
        "Fee calendar retrieved",
      ),
    );
});

// ✅ Get all students with overdue fees, sorted by daysOverdue (worst first)
export const getOverdueSummary = asyncHandler(async (req, res) => {
  const { DueRecord } = await import("../models/dueRecord.model.js");

  // Fetch all unresolved due records, populated with student info
  const dueRecords = await DueRecord.find({ resolved: false })
    .populate("studentId", "name phone email libraryId monthlyFee")
    .lean({ virtuals: true }); // virtuals: true gives us daysOverdue virtual

  // Build enriched list
  const students = dueRecords
    .filter((r) => r.studentId) // skip orphaned records
    .map((r) => {
      const days = r.daysOverdue ?? 0;
      let urgency = "green";
      if (days >= 30) urgency = "critical";
      else if (days >= 15) urgency = "red";
      else if (days >= 7) urgency = "orange";
      else if (days >= 3) urgency = "yellow";
      else if (days >= 1) urgency = "mild";

      return {
        dueRecordId: r._id,
        studentId: r.studentId._id,
        name: r.studentId.name,
        phone: r.studentId.phone,
        email: r.studentId.email,
        libraryId: r.studentId.libraryId,
        monthlyFee: r.studentId.monthlyFee,
        monthsDue: r.monthsDue,
        totalDueAmount: r.totalDueAmount,
        daysOverdue: days,
        lastReminderSentAt: r.lastReminderSentAt,
        nextReminderDue: r.nextReminderDue,
        reminderCount: r.reminderCount ?? 0,
        escalationLevel: r.escalationLevel ?? 0,
        urgency,
        dueSince: r.dueSince,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue); // worst first

  const totals = {
    totalStudentsOverdue: students.length,
    totalOutstandingAmount: students.reduce((s, r) => s + r.totalDueAmount, 0),
    critical: students.filter((r) => r.urgency === "critical").length,
    red: students.filter((r) => r.urgency === "red").length,
    orange: students.filter((r) => r.urgency === "orange").length,
    yellow: students.filter((r) => r.urgency === "yellow").length,
    mild: students.filter((r) => r.urgency === "mild").length,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, { students, totals }, "Overdue summary retrieved"),
    );
});

export const sendBulkOverdueReminders = asyncHandler(async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, "No students selected for reminder");
  }

  const { DueRecord } = await import("../models/dueRecord.model.js");
  const { Student } = await import("../models/student.model.js");
  const NotificationService = (
    await import("../services/notification.service.js")
  ).default;

  let success = 0;
  let errors = [];

  for (const studentId of studentIds) {
    try {
      const dueRecord = await DueRecord.findOne({ studentId, resolved: false });
      const student = await Student.findById(studentId);
      if (!dueRecord || !student) continue;
      await NotificationService.sendMultiChannelNotification({
        studentId: student._id,
        studentName: student.name,
        email: student.email,
        title: `Fee Overdue Reminder`,
        message: `Dear ${student.name}, your fee is overdue. Please pay immediately to avoid disruption.`,
        type: "FEE_OVERDUE_BULK",
        metadata: {
          dueRecordId: dueRecord._id,
          totalDueAmount: dueRecord.totalDueAmount,
        },
      });
      success++;
    } catch (err) {
      errors.push({ studentId, error: err.message });
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { success, errors }, "Bulk reminders sent"));
});

export const exportOverdueSummaryCSV = asyncHandler(async (req, res) => {
  const { DueRecord } = await import("../models/dueRecord.model.js");
  const dueRecords = await DueRecord.find({ resolved: false })
    .populate("studentId", "name phone email libraryId monthlyFee")
    .lean({ virtuals: true });

  const students = dueRecords
    .filter((r) => r.studentId)
    .map((r) => ({
      Name: r.studentId.name,
      LibraryID: r.studentId.libraryId,
      Phone: r.studentId.phone,
      Email: r.studentId.email,
      MonthsDue: r.monthsDue.join(", "),
      TotalDue: r.totalDueAmount,
      DaysOverdue: r.daysOverdue ?? 0,
      Urgency: r.escalationLevel,
      LastReminder: r.lastReminderSentAt
        ? new Date(r.lastReminderSentAt).toLocaleDateString()
        : "",
    }));

  const csvRows = [
    Object.keys(students[0] || {}).join(","),
    ...students.map((s) =>
      Object.values(s)
        .map((v) => `"${v}"`)
        .join(","),
    ),
  ];
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=overdue_summary.csv",
  );
  return res.status(200).send(csvRows.join("\n"));
});
