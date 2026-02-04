import { Router } from "express";
import {
  registerStudent,
  requestEmailOtp,
  verifyEmailOtp,
  loginStudent,
  logoutStudent,
  requestPasswordReset,
  resetPassword,
  getStudentProfile,
  updateStudentProfile,
  getStudentDashboard,
  getPaymentHistory,
  getStudentNotifications,
  markStudentNotificationRead,
  markAllStudentNotificationsRead,
  getStudentVapidKey,
  saveStudentPushSubscription,
  removeStudentPushSubscription,
  verifyPhoneWithFirebase,
  requestSlotChange,
  getMySlotChangeHistory,
  listChatStudents,
  listChatAdmins,
  getPaymentReceipt,
  downloadPaymentReceiptPDF,
} from "../controllers/studentAuth.controller.js";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import {
  authLimiter,
  otpLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// Public student auth routes - with rate limiting
router.route("/register").post(authLimiter, registerStudent);
router.route("/request-otp").post(otpLimiter, requestEmailOtp);
router.route("/verify-otp").post(otpLimiter, verifyEmailOtp);
router.route("/login").post(authLimiter, loginStudent);
router.route("/logout").post(verifyStudentJWT, logoutStudent);
router.route("/forgot-password/request").post(otpLimiter, requestPasswordReset);
router.route("/forgot-password/reset").post(otpLimiter, resetPassword);

// Protected student routes
router.use(verifyStudentJWT);

router.route("/me").get(getStudentProfile);
router.route("/profile").patch(updateStudentProfile);
router.route("/dashboard").get(getStudentDashboard);
router.route("/payments").get(getPaymentHistory);
router.route("/payments/:month/:year/receipt").get(getPaymentReceipt);
router
  .route("/payments/:month/:year/receipt-pdf")
  .get(downloadPaymentReceiptPDF);
router.route("/notifications").get(getStudentNotifications);
router.route("/notifications/vapid-key").get(getStudentVapidKey);
router.route("/notifications/subscribe").post(saveStudentPushSubscription);
router.route("/notifications/unsubscribe").post(removeStudentPushSubscription);
router
  .route("/notifications/read/:notificationId")
  .patch(markStudentNotificationRead);
router.route("/notifications/read-all").patch(markAllStudentNotificationsRead);
router.route("/verify-phone").post(verifyPhoneWithFirebase);

// Slot change routes
router.route("/slot/request-change").post(requestSlotChange);
router.route("/slot/change-history").get(getMySlotChangeHistory);

// Chat roster
router.route("/chat/students").get(listChatStudents);
router.route("/chat/admins").get(listChatAdmins);

export default router;
