import { Router } from "express";
import {
  registerStudent,
  requestEmailOtp,
  verifyOtpAndAuthenticate,
  loginStudent,
  logoutStudent,
  refreshStudent,
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
  getAvailableSlots,
} from "../controllers/studentAuth.controller.js";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import {
  resolveTenant,
  resolveTenantOptional,
} from "../middlewares/tenant.middleware.js";
import {
  authLimiter,
  otpLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// Public student auth routes - with rate limiting
router.route("/register").post(authLimiter, resolveTenantOptional, registerStudent);
router.route("/request-otp").post(otpLimiter, resolveTenantOptional, requestEmailOtp);
router.route("/verify-otp").post(otpLimiter, resolveTenantOptional, verifyOtpAndAuthenticate);
router.route("/login").post(authLimiter, resolveTenantOptional, loginStudent);
router.route("/logout").post(verifyStudentJWT, logoutStudent);
router.route("/refresh").post(authLimiter, resolveTenantOptional, refreshStudent);
router.route("/forgot-password/request").post(otpLimiter, resolveTenantOptional, requestPasswordReset);
router.route("/forgot-password/reset").post(otpLimiter, resolveTenantOptional, resetPassword);

// Protected student routes
router.use(verifyStudentJWT);
router.use(resolveTenant);

router.route("/profile").get(getStudentProfile).patch(updateStudentProfile);
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
router.route("/slots").get(getAvailableSlots);
router.route("/slot/request-change").post(requestSlotChange);
router.route("/slot/change-history").get(getMySlotChangeHistory);

// Chat roster
router.route("/chat/students").get(listChatStudents);
router.route("/chat/admins").get(listChatAdmins);

export default router;
