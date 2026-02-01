import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  markFeeAsPaid,
  markFeeAsDue,
  addAdvance,
  getFeeSummary,
  getDashboardPaymentStatus,
} from "../controllers/student.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Get fee summary (all staff can view)
router.route("/summary/:studentId").get(getFeeSummary);

// Get dashboard payment status
router.route("/dashboard-status").get(getDashboardPaymentStatus);

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
