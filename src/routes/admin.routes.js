import { Router } from "express";
import {
  loginAdmin,
  getAdminProfile,
  updateNotificationPreferences,
  registerAdmin,
  getAllAdmins,
  updateAdmin,
  updateOwnProfile,
  changePassword,
  deleteAdmin,
  getAuditLogs,
} from "../controllers/admin.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import {
  apiLimiter,
  authLimiter,
} from "../middlewares/rateLimiter.middleware.js";
import AnalyticsService from "../services/analytics.service.js";
import FeeService from "../services/fee.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Public Routes
router.route("/login").post(authLimiter, loginAdmin);

// Protected Routes - Apply rate limiter and auth to all protected routes
router.use(apiLimiter);
router.use(verifyJWT);

router.route("/profile").get(getAdminProfile);
router.route("/profile").patch(updateOwnProfile);
router.route("/profile/change-password").post(changePassword);
router.route("/notifications/preferences").patch(updateNotificationPreferences);

// Audit Logs (SUPER_ADMIN only)
router.route("/audit-logs").get(authorizeRoles("SUPER_ADMIN"), getAuditLogs);

// NEW: Admin Management Routes (SUPER_ADMIN only)
router.route("/register").post(authorizeRoles("SUPER_ADMIN"), registerAdmin);

router.route("/").get(authorizeRoles("SUPER_ADMIN"), getAllAdmins);

router
  .route("/:adminId")
  .patch(authorizeRoles("SUPER_ADMIN"), updateAdmin)
  .delete(authorizeRoles("SUPER_ADMIN"), deleteAdmin);

// Analytics Routes
router.route("/reports").get(
  asyncHandler(async (req, res) => {
    const { startMonth, startYear, endMonth, endYear, month, year } = req.query;

    const now = new Date();
    const parsedStartMonth = startMonth ?? month ?? now.getMonth();
    const parsedStartYear = startYear ?? year ?? now.getFullYear();
    const parsedEndMonth = endMonth ?? parsedStartMonth;
    const parsedEndYear = endYear ?? parsedStartYear;

    const report = await AnalyticsService.getFinancialReport(
      parseInt(parsedStartMonth, 10),
      parseInt(parsedStartYear, 10),
      parseInt(parsedEndMonth, 10),
      parseInt(parsedEndYear, 10),
    );

    return res.status(200).json(new ApiResponse(200, report, "Report fetched"));
  }),
);

router.route("/dashboard-stats").get(
  asyncHandler(async (req, res) => {
    const stats = await AnalyticsService.getDashboardStats();
    return res
      .status(200)
      .json(new ApiResponse(200, stats, "Dashboard stats fetched"));
  }),
);

// Staff list (SUPER_ADMIN only)
router.route("/staff").get(
  authorizeRoles("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const Admin = (await import("../models/admin.model.js")).Admin;
    const staff = await Admin.find({ role: "STAFF" }).select("-password");
    return res
      .status(200)
      .json(new ApiResponse(200, staff, "Staff list fetched"));
  }),
);

// Generate monthly fees (SUPER_ADMIN only - for testing/admin purposes)
router.route("/generate-fees").post(
  authorizeRoles("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { month, year } = req.body;

    if (month === undefined || year === undefined) {
      throw new Error("Month and year are required");
    }

    const result = await FeeService.generateMonthlyFees(
      parseInt(month, 10),
      parseInt(year, 10),
      req.admin._id,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "Monthly fees generated successfully"),
      );
  }),
);

export default router;
