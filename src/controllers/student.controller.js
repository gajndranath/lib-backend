import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import StudentService from "../services/student.service.js";
import FeeService from "../services/fee.service.js";
import SlotService from "../services/slot.service.js";
import StudentNotificationService from "../services/studentNotification.service.js";
import { studentRegistrationSchema } from "../utils/validators.js";

export const registerStudent = asyncHandler(async (req, res) => {
  // Validate input
  const validation = studentRegistrationSchema.safeParse(req.body);
  if (!validation.success) {
    console.log("Validation errors:", validation.error.errors);
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

  const student = await SlotService.overrideStudentFee(
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
