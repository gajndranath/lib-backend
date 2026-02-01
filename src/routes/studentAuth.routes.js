import { Router } from "express";
import {
  registerStudent,
  requestEmailOtp,
  verifyEmailOtp,
  loginStudent,
  requestPasswordReset,
  resetPassword,
  getStudentProfile,
  updateStudentProfile,
  getStudentDashboard,
  getPaymentHistory,
  getStudentNotifications,
  markStudentNotificationRead,
  markAllStudentNotificationsRead,
  verifyPhoneWithFirebase,
} from "../controllers/studentAuth.controller.js";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";

const router = Router();

// Public student auth routes
router.route("/register").post(registerStudent);
router.route("/request-otp").post(requestEmailOtp);
router.route("/verify-otp").post(verifyEmailOtp);
router.route("/login").post(loginStudent);
router.route("/forgot-password/request").post(requestPasswordReset);
router.route("/forgot-password/reset").post(resetPassword);

// Protected student routes
router.use(verifyStudentJWT);

router.route("/me").get(getStudentProfile);
router.route("/profile").patch(updateStudentProfile);
router.route("/dashboard").get(getStudentDashboard);
router.route("/payments").get(getPaymentHistory);
router.route("/notifications").get(getStudentNotifications);
router
  .route("/notifications/read/:notificationId")
  .patch(markStudentNotificationRead);
router.route("/notifications/read-all").patch(markAllStudentNotificationsRead);
router.route("/verify-phone").post(verifyPhoneWithFirebase);

export default router;
