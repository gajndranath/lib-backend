import { Router } from "express";
import {
  submitReport,
  getReports,
  updateReportStatus,
  moderateUser,
} from "../controllers/moderation.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";

const router = Router();

// Student routes (reporting)
router.post("/report", verifyStudentJWT, resolveTenant, submitReport);

// Admin routes (moderation)
router.use(verifyJWT);
router.use(resolveTenant);
router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));

router.get("/reports", getReports);
router.patch("/reports/:reportId", updateReportStatus);
router.post("/user/:userId/action", moderateUser);

export default router;
