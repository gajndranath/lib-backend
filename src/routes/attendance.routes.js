import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  markAttendance,
  getDailyAttendance,
  getMonthlyAttendanceStats,
} from "../controllers/attendance.controller.js";

const router = Router();

// Apply rate limiting, authentication, and tenant resolution
router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);

// Only Admins can manage attendance
router.use(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN));

router.route("/").post(markAttendance);
router.route("/daily").get(getDailyAttendance);
router.route("/stats").get(getMonthlyAttendanceStats);

export default router;
