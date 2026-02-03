import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import {
  getMyReminders,
  getReminderDetails,
  pauseReminder,
  resumeReminder,
  stopReminder,
  updateReminder,
  sendReminder,
  getEndOfMonthDueSummary,
} from "../controllers/adminReminder.controller.js";

const router = Router();

// Apply rate limiting and authentication to all routes
router.use(apiLimiter);
router.use(verifyJWT);

// Get my reminders (all staff can view their own)
router.route("/").get(getMyReminders);

// Get end-of-month due summary
router.route("/due-summary").get(getEndOfMonthDueSummary);

// Get reminder details
router.route("/:reminderId").get(getReminderDetails);

// Update reminder (edit title, message, schedule, channels)
router.route("/:reminderId").patch(updateReminder);

// Pause a reminder
router.route("/:reminderId/pause").post(pauseReminder);

// Resume a paused reminder
router.route("/:reminderId/resume").post(resumeReminder);

// Stop/deactivate a reminder
router.route("/:reminderId/stop").post(stopReminder);

// Send reminder manually
router.route("/:reminderId/send").post(sendReminder);

export default router;
