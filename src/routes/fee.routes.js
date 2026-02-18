import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  markFeeAsPaid,
  markFeeAsDue,
  addAdvance,
  getFeeSummary,
  getDashboardPaymentStatus,
  getReceiptDetails,
  downloadReceiptPDF,
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

// Get receipt details (admin)
router
  .route("/:studentId/:month/:year/receipt-details")
  .get(authorizeRoles(UserRoles.SUPER_ADMIN), getReceiptDetails);

// Download receipt PDF (admin)
router
  .route("/:studentId/:month/:year/receipt-pdf")
  .get(authorizeRoles(UserRoles.SUPER_ADMIN), downloadReceiptPDF);

// Protected routes for Super Admin only
router
  .route("/:studentId/:month/:year/paid")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), markFeeAsPaid);

router
  .route("/:studentId/:month/:year/due")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), markFeeAsDue);

router
  .route("/:studentId/advance")
  .post(authorizeRoles(UserRoles.SUPER_ADMIN), addAdvance);

export default router;
