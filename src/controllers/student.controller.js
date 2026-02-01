import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import StudentService from "../services/student.service.js";
import FeeService from "../services/fee.service.js";
import SlotService from "../services/slot.service.js";
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
  const { newSlotId } = req.body;

  const result = await SlotService.changeStudentSlot(
    studentId,
    newSlotId,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Student slot changed successfully"));
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

  if (!subscription) {
    throw new ApiError(400, "Subscription is required");
  }

  const Student = (await import("../models/student.model.js")).Student;

  // Update based on type
  if (type === "web") {
    await Student.findByIdAndUpdate(studentId, {
      webPushSubscription: subscription,
    });
  } else if (type === "fcm") {
    await Student.findByIdAndUpdate(studentId, {
      fcmToken: subscription.token || subscription,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription saved successfully"));
});

// Remove student push subscription
export const removePushSubscription = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { type = "web" } = req.body;

  const Student = (await import("../models/student.model.js")).Student;

  if (type === "web") {
    await Student.findByIdAndUpdate(studentId, {
      webPushSubscription: null,
    });
  } else if (type === "fcm") {
    await Student.findByIdAndUpdate(studentId, {
      fcmToken: null,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription removed successfully"));
});
