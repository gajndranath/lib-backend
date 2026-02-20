import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import FeeService from "../services/fee.service.js";
import { sendEmail } from "../config/email.config.js";
import admin from "firebase-admin";
import { getVapidPublicKey } from "../config/webpush.config.js";
import { StudentStatus } from "../constants/constants.js";
import {
  generateLibraryId,
  generateOtp,
  hashOtp,
  checkEmailExists,
  checkPhoneExists,
} from "../utils/studentHelpers.js";

const otpRequestSchema = z.object({
  email: z.string().trim().email(),
  purpose: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => ["LOGIN", "RESET", "VERIFY"].includes(value), {
      message: "Invalid purpose",
    })
    .optional(),
});

const otpVerifySchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().min(4).max(8),
  setPassword: z.string().min(6).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(4).max(8),
  newPassword: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().regex(/^\d{10}$/), // ✅ Required for student
  address: z.string().optional(),
  fatherName: z.string().optional(),
  password: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 6, {
      message: "Password must be at least 6 characters",
    }),
});

const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    phone: z
      .string()
      .regex(/^\d{10}$/)
      .optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    fatherName: z.string().optional(),
  })
  .strict();

const OTP_EXP_MIN = 10;

// ✅ Helper function to send OTP emails
const sendOtpEmail = async (email, otp, purpose) => {
  const purposeText =
    purpose === "RESET"
      ? "password reset"
      : purpose === "VERIFY"
        ? "email verification"
        : "login";

  const subject = `Your ${purposeText} code`;
  const text = `Your ${purposeText} OTP is: ${otp}\n\nThis code will expire in ${OTP_EXP_MIN} minutes.`;
  console.log("\n🚀 [OTP SEND] Sending OTP:", {
    to: email,
    otp,
    purpose,
    subject,
    text,
    time: new Date().toISOString(),
  });
  const response = await sendEmail(email, subject, text);
  console.log("✅ [OTP SEND] Email sent. Response:", response);
  return response;
};

// ========================================
// STUDENT SELF-REGISTRATION FLOW
// ========================================

// Add logging for OTP receive/verify
const logOtpVerify = (email, otp, status, extra = {}) => {
  console.log("\n📧 [OTP VERIFY] Attempt:", { email, otp, status, ...extra });
};

export const registerStudent = asyncHandler(async (req, res) => {
  const validation = registerSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { name, email, phone, address, fatherName, password } = validation.data;

  // ✅ Check email uniqueness
  const existingEmail = await checkEmailExists(email);
  if (existingEmail) {
    throw new ApiError(409, "Email already registered");
  }

  // ✅ Check phone uniqueness
  const existingPhone = await checkPhoneExists(phone);
  if (existingPhone) {
    throw new ApiError(409, "Phone number already registered");
  }

  // ✅ Generate library ID
  const libraryId = await generateLibraryId();

  // ENV-based email verification logic
  let emailVerified = false;
  let otp, otpHash, otpExpiresAt, otpPurpose;
  if (process.env.NODE_ENV === "development") {
    emailVerified = true;
    console.log(
      "[DEV] Skipping email OTP verification, setting emailVerified: true",
    );
  } else {
    // Production: require OTP/email verification
    otp = generateOtp();
    otpHash = hashOtp(otp);
    otpExpiresAt = new Date(Date.now() + OTP_EXP_MIN * 60 * 1000);
    otpPurpose = "VERIFY";
  }

  // ✅ Create student (INACTIVE until verified)
  const student = await Student.create({
    libraryId,
    name,
    email: email.toLowerCase(),
    phone,
    address,
    fatherName,
    status: StudentStatus.INACTIVE,
    emailVerified,
    ...(password && { password }), // ✅ Only include password if provided (Dev mode)
    otpHash,
    otpExpiresAt,
    otpPurpose,
    tenantId: req.tenantId, // Capture tenantId from header/subdomain
  });

  // Only send OTP in production
  if (process.env.NODE_ENV !== "development") {
    const emailResult = await sendOtpEmail(email, otp, "VERIFY");
    if (emailResult?.success) {
      console.log(`✅ Verification email sent to ${email}`);
    } else {
      console.warn(`⚠️ Failed to send verification email to ${email}`);
    }
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        email: student.email,
        libraryId: student.libraryId,
        message: "Check your email for verification code",
      },
      "Registration successful. Please verify your email.",
    ),
  );
});

// ========================================
// OTP REQUEST & VERIFICATION
// ========================================

/**
 * Request OTP (SEND EMAIL) - for login/reset/registration
 */
export const requestEmailOtp = asyncHandler(async (req, res) => {
  const validation = otpRequestSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.issues);
  }

  const { email, purpose = "LOGIN" } = validation.data;

  const student = await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  }).select("+password");

  if (!student || !student.email) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "OTP sent if account exists"));
  }

  const otp = generateOtp();
  student.otpHash = hashOtp(otp);
  student.otpExpiresAt = new Date(Date.now() + OTP_EXP_MIN * 60 * 1000);
  student.otpPurpose = purpose;

  await student.save({ validateBeforeSave: false });
  await sendOtpEmail(student.email, otp, purpose);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "OTP sent successfully"));
});

/**
 * Verify OTP and authenticate/activate account
 */
export const verifyOtpAndAuthenticate = asyncHandler(async (req, res) => {
  const validation = otpVerifySchema.safeParse(req.body);
  if (!validation.success) {
    logOtpVerify(req.body?.email, req.body?.otp, "validation_error", {
      error: validation.error.issues,
    });
    throw new ApiError(400, "Validation Error", validation.error.issues);
  }

  const { email, otp, setPassword } = validation.data;

  const student = await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  }).select("+password");

  if (!student || !student.otpHash || !student.otpExpiresAt) {
    logOtpVerify(email, otp, "not_found_or_expired", {
      studentFound: !!student,
    });
    throw new ApiError(400, "Invalid or expired OTP");
  }

  if (student.otpExpiresAt < new Date()) {
    logOtpVerify(email, otp, "expired", { expiresAt: student.otpExpiresAt });
    throw new ApiError(400, "OTP expired");
  }

  const incomingHash = hashOtp(otp);
  if (incomingHash !== student.otpHash) {
    logOtpVerify(email, otp, "invalid", { hashMatch: false });
    throw new ApiError(400, "Invalid OTP");
  }

  logOtpVerify(email, otp, "success", { studentId: student._id });
  // ✅ Verify email and activate account (if INACTIVE)
  student.emailVerified = true;
  if (student.status === StudentStatus.INACTIVE) {
    student.status = StudentStatus.ACTIVE;
  }
  student.otpHash = undefined;
  student.otpExpiresAt = undefined;
  student.otpPurpose = undefined;

  if (setPassword) {
    student.password = setPassword;
  }

  // Ensure tenantId is set if resolved (fallback for existing students not migrated)
  if (!student.tenantId && req.tenantId) {
    student.tenantId = req.tenantId;
  }

  await student.save();

  const accessToken = student.generateAccessToken();
  const refreshToken = student.generateRefreshToken();

  // Save refresh token
  await Student.findByIdAndUpdate(student._id, { refreshToken });

  const safeStudent = await Student.findById(student._id).select(
    "-password -otpHash -otpExpiresAt -otpPurpose -refreshToken",
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        200,
        { student: safeStudent, accessToken },
        "OTP verified successfully",
      ),
    );
});

export const loginStudent = asyncHandler(async (req, res) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { email, password } = validation.data;
  const student = await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  }).select("+password");

  if (!student) throw new ApiError(404, "Student not found");

  if (!student.emailVerified) {
    throw new ApiError(403, "Email not verified. Request OTP to continue.");
  }

  if (!student.password) {
    throw new ApiError(403, "Password not set. Verify OTP to set password.");
  }

  const isPasswordValid = await student.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid credentials");

  const accessToken = student.generateAccessToken();
  const refreshToken = student.generateRefreshToken();

  // Save refresh token
  await Student.findByIdAndUpdate(student._id, { refreshToken });

  const safeStudent = await Student.findById(student._id).select(
    "-password -otpHash -otpExpiresAt -otpPurpose -refreshToken",
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(
        200,
        { student: safeStudent, accessToken },
        "Login successful",
      ),
    );
});

export const logoutStudent = asyncHandler(async (req, res) => {
  // Clear refresh token from DB
  if (req.student?._id) {
    await Student.findByIdAndUpdate(req.student._id, { refreshToken: null });
  }

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, null, "Logged out successfully"));
});

/**
 * Refresh student tokens (rotate refresh token)
 */
export const refreshStudent = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  let decoded;
  try {
    decoded = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  if (decoded.userType !== "Student") {
    throw new ApiError(401, "Invalid token type");
  }

  // Fetch student and verify stored token matches (rotation check)
  const student = await Student.findById(decoded._id)
    .select("+refreshToken")
    .where({ isDeleted: false });

  if (!student || student.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, "Refresh token reuse detected or token invalid");
  }

  if (student.status === StudentStatus.ARCHIVED) {
    throw new ApiError(403, "Account is archived");
  }

  // Issue new token pair
  const newAccessToken = student.generateAccessToken();
  const newRefreshToken = student.generateRefreshToken();

  // Rotate: save new refresh token
  await Student.findByIdAndUpdate(student._id, {
    refreshToken: newRefreshToken,
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .cookie("accessToken", newAccessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json(
      new ApiResponse(200, { accessToken: newAccessToken }, "Tokens refreshed"),
    );
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const validation = otpRequestSchema.safeParse({
    ...req.body,
    purpose: "RESET",
  });
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { email } = validation.data;
  const student = await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  });

  if (!student || !student.email) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "OTP sent if account exists"));
  }

  const otp = generateOtp();
  student.otpHash = hashOtp(otp);
  student.otpExpiresAt = new Date(Date.now() + OTP_EXP_MIN * 60 * 1000);
  student.otpPurpose = "RESET";

  await student.save({ validateBeforeSave: false });
  await sendOtpEmail(student.email, otp, "RESET");

  return res
    .status(200)
    .json(new ApiResponse(200, null, "OTP sent successfully"));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const validation = resetSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { email, otp, newPassword } = validation.data;

  const student = await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  }).select("+password");

  if (!student || !student.otpHash || !student.otpExpiresAt) {
    throw new ApiError(400, "Invalid or expired OTP");
  }

  if (student.otpPurpose !== "RESET") {
    throw new ApiError(400, "OTP not valid for password reset");
  }

  if (student.otpExpiresAt < new Date()) {
    throw new ApiError(400, "OTP expired");
  }

  const incomingHash = hashOtp(otp);
  if (incomingHash !== student.otpHash) {
    throw new ApiError(400, "Invalid OTP");
  }

  student.password = newPassword;
  student.otpHash = undefined;
  student.otpExpiresAt = undefined;
  student.otpPurpose = undefined;

  await student.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset successful"));
});

export const getStudentProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.student._id)
    .populate({
      path: "slotId",
      select: "name timeRange monthlyFee totalSeats",
    })
    .select("-password -otpHash -otpExpiresAt -otpPurpose");

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Student profile fetched"));
});

export const updateStudentProfile = asyncHandler(async (req, res) => {
  const validation = updateProfileSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const updates = validation.data;
  const student = await Student.findById(req.student._id).select(
    "-password -otpHash -otpExpiresAt -otpPurpose",
  );

  if (!student) throw new ApiError(404, "Student not found");

  if (updates.email && updates.email !== student.email) {
    student.email = updates.email.toLowerCase();
    student.emailVerified = false;
  }

  if (updates.phone && updates.phone !== student.phone) {
    student.phone = updates.phone;
    student.phoneVerified = false;
  }

  student.name = updates.name ?? student.name;
  student.address = updates.address ?? student.address;
  student.fatherName = updates.fatherName ?? student.fatherName;

  await student.save();

  return res
    .status(200)
    .json(new ApiResponse(200, student, "Profile updated successfully"));
});

export const getStudentDashboard = asyncHandler(async (req, res) => {
  const { Student } = await import("../models/student.model.js");
  await import("../models/slot.model.js");
  await import("../models/studentMonthlyFee.model.js");
  const { Announcement } = await import("../models/announcement.model.js");
  const Notification = (await import("../models/notification.model.js"))
    .default;
  const studentDoc = await Student.findById(req.student._id)
    .populate({
      path: "slotId",
      select:
        "name timeRange monthlyFee totalSeats isActive createdAt updatedAt",
      model: "Slot",
    })
    .select("-password -otpHash -otpExpiresAt -otpPurpose");

  if (!studentDoc) {
    throw new ApiError(404, "Student not found");
  }

  const studentId = studentDoc._id;

  const [
    feeSummary,
    recentPayments,
    dueItems,
    unreadNotifications,
    announcements,
  ] = await Promise.all([
    FeeService.getStudentFeeSummary(studentId),
    StudentMonthlyFee.find({ studentId, status: "PAID" })
      .sort({ paymentDate: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    StudentMonthlyFee.find({ studentId, status: "DUE" })
      .sort({ year: -1, month: -1 })
      .limit(3)
      .lean(),
    Notification.find({ userId: studentId, read: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Announcement.find({
      $or: [
        { targetScope: "ALL_STUDENTS" },
        {
          targetScope: "SLOT",
          slotId: studentDoc.slotId?._id || studentDoc.slotId,
        },
        { targetScope: "SPECIFIC_STUDENTS", recipientIds: studentId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // Build a full student profile object for dashboard (all personal fields)
  const student = {
    _id: studentDoc._id,
    name: studentDoc.name,
    phone: studentDoc.phone,
    email: studentDoc.email,
    emailVerified: studentDoc.emailVerified,
    phoneVerified: studentDoc.phoneVerified,
    address: studentDoc.address,
    fatherName: studentDoc.fatherName,
    monthlyFee: studentDoc.monthlyFee,
    feeOverride: studentDoc.feeOverride,
    status: studentDoc.status,
    isDeleted: studentDoc.isDeleted,
    keyBackupVersion: studentDoc.keyBackupVersion,
    tags: studentDoc.tags,
    joiningDate: studentDoc.joiningDate,
    createdAt: studentDoc.createdAt,
    updatedAt: studentDoc.updatedAt,
    billingDay: studentDoc.billingDay,
    nextBillingDate: studentDoc.nextBillingDate,
    webPushSubscription: studentDoc.webPushSubscription,
    joiningMonth: studentDoc.joiningMonth,
    seatNumber: studentDoc.seatNumber,
    slot:
      studentDoc.slotId && typeof studentDoc.slotId === "object"
        ? {
            _id: studentDoc.slotId._id,
            name: studentDoc.slotId.name,
            timeRange: studentDoc.slotId.timeRange,
            monthlyFee: studentDoc.slotId.monthlyFee,
            totalSeats: studentDoc.slotId.totalSeats,
            isActive: studentDoc.slotId.isActive,
            createdAt: studentDoc.slotId.createdAt,
            updatedAt: studentDoc.slotId.updatedAt,
          }
        : null,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        student,
        feeSummary,
        recentPayments,
        dueItems,
        unreadNotifications,
        announcements,
      },
      "Student dashboard fetched",
    ),
  );
});
// ========================================
// PASSWORD-BASED LOGIN
// ========================================

/**
 * Student login with email and password
 */ export const getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [payments, total] = await Promise.all([
    StudentMonthlyFee.find({ studentId: req.student._id })
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    StudentMonthlyFee.countDocuments({ studentId: req.student._id }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
      "Payment history fetched",
    ),
  );
});
// ========================================
// LOGOUT & SESSION MANAGEMENT
// ========================================

/**
 * Student logout
 */ export const getStudentNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const Notification = (await import("../models/notification.model.js"))
    .default;

  const query = { userId: req.student._id };
  if (unreadOnly === "true") {
    query.read = false;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Notification.countDocuments(query),
  ]);

  const unreadCount = await Notification.countDocuments({
    userId: req.student._id,
    read: false,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        unreadCount,
      },
      "Notification history fetched",
    ),
  );
});

export const markStudentNotificationRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const Notification = (await import("../models/notification.model.js"))
    .default;

  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  if (notification.userId.toString() !== req.student._id.toString()) {
    throw new ApiError(403, "Not authorized to update this notification");
  }

  await notification.markAsRead();

  return res
    .status(200)
    .json(new ApiResponse(200, notification, "Notification marked as read"));
});

export const markAllStudentNotificationsRead = asyncHandler(
  async (req, res) => {
    const Notification = (await import("../models/notification.model.js"))
      .default;

    await Notification.updateMany(
      { userId: req.student._id, read: false },
      { $set: { read: true, readAt: new Date() } },
    );

    const unreadCount = await Notification.countDocuments({
      userId: req.student._id,
      read: false,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { unreadCount },
          "All notifications marked as read",
        ),
      );
  },
);

export const getStudentVapidKey = asyncHandler(async (_req, res) => {
  try {
    const publicKey = getVapidPublicKey();
    return res
      .status(200)
      .json(new ApiResponse(200, { publicKey }, "VAPID public key"));
  } catch (error) {
    throw new ApiError(500, "Web Push not configured");
  }
});

export const saveStudentPushSubscription = asyncHandler(async (req, res) => {
  const { subscription, type = "web", deviceInfo = {} } = req.body;

  if (!subscription) {
    throw new ApiError(400, "Subscription is required");
  }

  const update = {
    deviceInfo,
  };

  if (type === "web") {
    update.webPushSubscription = subscription;
  } else if (type === "fcm") {
    update.fcmToken = subscription.token || subscription;
  }

  await Student.findByIdAndUpdate(req.student._id, update);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription saved successfully"));
});

export const removeStudentPushSubscription = asyncHandler(async (req, res) => {
  const { type = "web" } = req.body;

  const update = {};
  if (type === "web") {
    update.webPushSubscription = null;
  } else if (type === "fcm") {
    update.fcmToken = null;
  }

  await Student.findByIdAndUpdate(req.student._id, update);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Subscription removed successfully"));
});

export const verifyPhoneWithFirebase = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, "idToken is required");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const phoneNumber = decoded.phone_number;

    if (!phoneNumber) {
      throw new ApiError(400, "Phone number not found in token");
    }

    const student = await Student.findById(req.student._id);
    if (!student) throw new ApiError(404, "Student not found");

    student.phone = student.phone || phoneNumber.replace(/\D/g, "").slice(-10);
    student.phoneVerified = true;
    await student.save();

    return res
      .status(200)
      .json(new ApiResponse(200, student, "Phone verified successfully"));
  } catch (error) {
    throw new ApiError(400, error?.message || "Phone verification failed");
  }
});
// Request slot change (student initiated)
export const requestSlotChange = asyncHandler(async (req, res) => {
  const { newSlotId, reason = "" } = req.body;
  const SlotService = (await import("../services/slot.service.js")).default;

  if (!newSlotId) {
    throw new ApiError(400, "New slot ID is required");
  }

  const result = await SlotService.requestSlotChange(
    req.student._id,
    newSlotId,
    reason,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Slot change request submitted successfully",
      ),
    );
});

// Get student's slot change history
export const getMySlotChangeHistory = asyncHandler(async (req, res) => {
  const SlotService = (await import("../services/slot.service.js")).default;

  const history = await SlotService.getStudentSlotHistory(req.student._id);

  return res
    .status(200)
    .json(
      new ApiResponse(200, history, "Slot change history fetched successfully"),
    );
});

// List students for chat (student view)
export const listChatStudents = asyncHandler(async (_req, res) => {
  const students = await Student.find({ status: "ACTIVE", isDeleted: false })
    .select("_id name slotId")
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, students, "Students fetched"));
});

// List admins for chat (student view)
export const listChatAdmins = asyncHandler(async (_req, res) => {
  const Admin = (await import("../models/admin.model.js")).Admin;
  const cacheService = (await import("../utils/cache.js")).default;

  try {
    // Try to get from cache first
    const cacheKey = "chat:admins:list";
    let admins = await cacheService.get(cacheKey);

    if (admins) {
      console.log("Admins from cache");
      return res
        .status(200)
        .json(new ApiResponse(200, admins, "Admins fetched"));
    }

    console.log("Fetching admins from database");

    // Try to get active admins first
    admins = await Admin.find({ isActive: true })
      .select("_id username email")
      .lean();

    console.log("Active admins found:", admins.length);

    // If no active admins, also check inactive ones (fallback for development)
    if (admins.length === 0) {
      console.log("No active admins found, checking all admins...");
      admins = await Admin.find({})
        .select("_id username email isActive")
        .lean();
    }

    // Cache for 10 minutes
    await cacheService.set(cacheKey, admins, 10 * 60);

    return res.status(200).json(new ApiResponse(200, admins, "Admins fetched"));
  } catch (error) {
    console.error("Error in listChatAdmins:", error);
    throw error;
  }
});

// Get student payment receipt
export const getPaymentReceipt = asyncHandler(async (req, res) => {
  const { month, year } = req.params;
  const studentId = req.student._id;

  const FeeService = (await import("../services/fee.service.js")).default;

  const receipt = await FeeService.generateReceipt(
    studentId,
    parseInt(month),
    parseInt(year),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, receipt, "Receipt generated successfully"));
});

// Download student payment receipt PDF
export const downloadPaymentReceiptPDF = asyncHandler(async (req, res) => {
  const { month, year } = req.params;
  const studentId = req.student._id;

  const FeeService = (await import("../services/fee.service.js")).default;

  const html = await FeeService.getReceiptHTML(
    studentId,
    parseInt(month),
    parseInt(year),
  );

  res.setHeader("Content-Type", "text/html");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="receipt-${month}-${year}.html"`,
  );
  res.send(html);
});

// Get available slots for student selection
export const getAvailableSlots = asyncHandler(async (_req, res) => {
  const { Slot } = await import("../models/slot.model.js");

  const slots = await Slot.find({ isActive: true })
    .select("name timeRange monthlyFee totalSeats")
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, slots, "Available slots fetched"));
});
