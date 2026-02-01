import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import AdminReminderService from "../services/adminReminder.service.js";

// Get all active reminders for current admin
export const getMyReminders = asyncHandler(async (req, res) => {
  const { type, isPaused } = req.query;

  const filters = {};
  if (type) filters.type = type;
  if (isPaused !== undefined) filters.isPaused = isPaused === "true";

  const reminders = await AdminReminderService.getAdminReminders(
    req.admin._id,
    filters,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, reminders, "Reminders fetched successfully"));
});

// Get reminder details
export const getReminderDetails = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;

  const reminder = await AdminReminderService.getReminderDetails(reminderId);

  // Check permission
  if (
    reminder.adminId._id.toString() !== req.admin._id.toString() &&
    reminder.createdBy?.toString() !== req.admin._id.toString()
  ) {
    throw new ApiError(403, "You don't have permission to view this reminder");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, reminder, "Reminder details fetched successfully"),
    );
});

// Pause a reminder
export const pauseReminder = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;
  const { reason } = req.body;

  const reminder = await AdminReminderService.pauseReminder(
    reminderId,
    req.admin._id,
    reason,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, reminder, "Reminder paused successfully"));
});

// Resume a paused reminder
export const resumeReminder = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;

  const reminder = await AdminReminderService.resumeReminder(
    reminderId,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, reminder, "Reminder resumed successfully"));
});

// Stop/deactivate a reminder
export const stopReminder = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;

  const reminder = await AdminReminderService.stopReminder(
    reminderId,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, reminder, "Reminder stopped successfully"));
});

// Update reminder
export const updateReminder = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;
  const { title, message, deliverVia, schedule } = req.body;

  const reminder = await AdminReminderService.updateReminder(
    reminderId,
    req.admin._id,
    {
      title,
      message,
      deliverVia,
      schedule,
    },
  );

  return res
    .status(200)
    .json(new ApiResponse(200, reminder, "Reminder updated successfully"));
});

// Send reminder manually
export const sendReminder = asyncHandler(async (req, res) => {
  const { reminderId } = req.params;

  const reminder = await AdminReminderService.sendReminder(reminderId);

  return res
    .status(200)
    .json(new ApiResponse(200, reminder, "Reminder sent successfully"));
});

// Get end-of-month due students summary
export const getEndOfMonthDueSummary = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  if (month === undefined || year === undefined) {
    throw new ApiError(400, "Month and year are required");
  }

  const summary = await AdminReminderService.getEndOfMonthDueSummary(
    parseInt(month),
    parseInt(year),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        summary,
        "End-of-month due summary fetched successfully",
      ),
    );
});
