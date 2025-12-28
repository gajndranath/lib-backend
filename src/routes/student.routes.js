import { Router } from "express";
import {
  registerStudent,
  getDashboardData,
  updatePaymentStatus,
  toggleStudentReminder,
  getStudentHistory,
} from "../controllers/student.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { UserRoles } from "../constants/constants.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

// Dashboard accessible to all authenticated users
router.route("/dashboard").get(getDashboardData);

// Student history
router.route("/:studentId/history").get(getStudentHistory);

// Reminder toggle
router.route("/toggle-reminder").patch(toggleStudentReminder);

// Protected routes for Super Admin only
router
  .route("/register")
  .post(authorizeRoles(UserRoles.SUPER_ADMIN), registerStudent);

router
  .route("/update-payment")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), updatePaymentStatus);

// Additional routes for staff (read-only)
router.route("/list").get(
  asyncHandler(async (req, res) => {
    const Student = (await import("../models/student.model.js")).Student;
    const students = await Student.find({ isDeleted: false })
      .select("name phone monthlyFees status billingDay")
      .sort({ name: 1 });

    return res
      .status(200)
      .json(new ApiResponse(200, students, "Students list fetched"));
  })
);

export default router;
