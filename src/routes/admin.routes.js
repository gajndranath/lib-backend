import { Router } from "express";
import {
  loginAdmin,
  getAdminProfile,
  updateNotificationPreferences,
} from "../controllers/admin.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";
import AnalyticsService from "../services/analytics.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Public Routes
router.route("/login").post(authLimiter, loginAdmin);

// Protected Routes
router.use(verifyJWT);

router.route("/profile").get(getAdminProfile);
router.route("/notifications/preferences").patch(updateNotificationPreferences);

// Analytics Routes
router.route("/reports").get(
  asyncHandler(async (req, res) => {
    const { month, year } = req.query;
    const report = await AnalyticsService.getMonthlyReport(month, year);
    return res.status(200).json(new ApiResponse(200, report, "Report fetched"));
  })
);

router.route("/dashboard-stats").get(
  asyncHandler(async (req, res) => {
    const stats = await AnalyticsService.getDashboardStats();
    return res
      .status(200)
      .json(new ApiResponse(200, stats, "Dashboard stats fetched"));
  })
);

// Admin management (Super Admin only)
router.route("/staff").get(
  authorizeRoles("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const Admin = (await import("../models/admin.model.js")).Admin;
    const staff = await Admin.find({ role: "STAFF" }).select("-password");
    return res
      .status(200)
      .json(new ApiResponse(200, staff, "Staff list fetched"));
  })
);

export default router;
