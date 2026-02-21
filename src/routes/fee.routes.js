import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  markFeeAsPaid,
  markFeeAsDue,
  addAdvance,
  applyAdvance,
  getFeeSummary,
  getDashboardPaymentStatus,
  getReceiptDetails,
  downloadReceiptPDF,
  getStudentFeeCalendar,
  getOverdueSummary,
  sendBulkOverdueReminders,
  exportOverdueSummaryCSV,
} from "../controllers/student.controller.js";

const router = Router();

// Apply rate limiting and authentication to all routes
router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);

// Get fee summary (all staff can view)
router.route("/summary/:studentId").get(getFeeSummary);

// Get dashboard payment status
router.route("/dashboard-status").get(getDashboardPaymentStatus);

// ✅ Get full-year calendar for a student (admin view)
router.route("/calendar/:studentId").get(getStudentFeeCalendar);

// ✅ Get all overdue students sorted by daysOverdue (admin dashboard)
router.route("/overdue-summary").get(getOverdueSummary);

// Get receipt details (admin)
router
  .route("/:studentId/:month/:year/receipt-details")
  .get(
    authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN),
    getReceiptDetails,
  );

// Download receipt PDF (admin)
router
  .route("/:studentId/:month/:year/receipt-pdf")
  .get(
    authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN),
    downloadReceiptPDF,
  );

// GET /overdue-summary/export for CSV export
router
  .route("/overdue-summary/export")
  .get(
    authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN),
    exportOverdueSummaryCSV,
  );

// Protected routes for Admin and Super Admin
router
  .route("/:studentId/:month/:year/paid")
  .patch(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN), markFeeAsPaid);

router
  .route("/:studentId/:month/:year/due")
  .patch(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN), markFeeAsDue);

router
  .route("/:studentId/advance")
  .post(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN), addAdvance);

router
  .route("/:studentId/advance/apply")
  .post(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN), applyAdvance);

// Bulk overdue reminders
router
  .route("/overdue-reminders/bulk")
  .post(
    authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN),
    sendBulkOverdueReminders,
  );

export default router;
