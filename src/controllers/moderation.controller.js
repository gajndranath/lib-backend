import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { UserReport } from "../models/userReport.model.js";
import { Student } from "../models/student.model.js";
import { StudentStatus, ReportStatus } from "../constants/constants.js";
import mongoose from "mongoose";

/**
 * Submit a report against another user
 */
export const submitReport = asyncHandler(async (req, res) => {
  const { reportedId, reason, description, evidence } = req.body;
  const reporterId = req.student?._id || req.admin?._id;

  if (!reportedId || !reason) {
    throw new ApiError(400, "Reported user ID and reason are required");
  }

  if (reportedId.toString() === reporterId.toString()) {
    throw new ApiError(400, "You cannot report yourself");
  }

  // Check if target exists
  const target = await Student.findById(reportedId);
  if (!target) {
    throw new ApiError(404, "Reported user not found");
  }

  const report = await UserReport.create({
    reporterId,
    reportedId,
    reason,
    description,
    evidence: evidence || [],
    tenantId: req.tenantId,
  });

  return res.status(201).json(new ApiResponse(201, report, "Report submitted successfully"));
});

/**
 * List all reports (Admin only)
 */
export const getReports = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  
  const filter = { tenantId: req.tenantId };
  if (status) filter.status = status;

  const reports = await UserReport.find(filter)
    .populate("reporterId", "name libraryId phone")
    .populate("reportedId", "name libraryId phone status")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await UserReport.countDocuments(filter);

  return res.status(200).json(new ApiResponse(200, {
    reports,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, "Reports fetched successfully"));
});

/**
 * Resolve/Dismiss a report (Admin only)
 */
export const updateReportStatus = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { status, adminNote } = req.body;

  if (!Object.values(ReportStatus).includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const report = await UserReport.findByIdAndUpdate(
    reportId,
    { 
      status, 
      adminNote, 
      resolvedBy: req.admin._id,
      resolvedAt: new Date()
    },
    { new: true }
  );

  if (!report) {
    throw new ApiError(404, "Report not found");
  }

  return res.status(200).json(new ApiResponse(200, report, `Report marked as ${status}`));
});

/**
 * Take moderation action against a user (Admin only)
 */
export const moderateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { action, reason } = req.body; // action: BAN, SUSPEND, ACTIVATE, WARN

  const student = await Student.findById(userId);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  let statusUpdate = student.status;
  let message = "";

  switch (action) {
    case "BAN":
      statusUpdate = StudentStatus.BANNED;
      message = "User has been permanently banned";
      break;
    case "SUSPEND":
      statusUpdate = StudentStatus.SUSPENDED;
      message = "User has been suspended";
      break;
    case "ACTIVATE":
      statusUpdate = StudentStatus.ACTIVE;
      message = "User status restored to Active";
      break;
    default:
      throw new ApiError(400, "Invalid moderation action");
  }

  student.status = statusUpdate;
  if (reason) {
    student.notes = student.notes 
      ? `${student.notes}\n[MODERATION ${action}] ${new Date().toISOString()}: ${reason}` 
      : `[MODERATION ${action}] ${reason}`;
  }
  
  await student.save();

  // Force logout or emit socket event? 
  // For now, next request with their token will fail if we check status in middleware.

  return res.status(200).json(new ApiResponse(200, student, message));
});
