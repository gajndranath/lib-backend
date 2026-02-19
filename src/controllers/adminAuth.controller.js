import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";
import { sendEmail } from "../services/email.service.js";
/**
 * @desc    Forgot Password - Send reset link
 * @route   POST /api/v1/admin/forgot-password
 * @access  Public
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const admin = await Admin.findOne({ email });

  if (!admin) {
    throw new ApiError(404, "There is no admin with that email");
  }

  // Get reset token
  const resetToken = admin.getResetPasswordToken();

  // Save admin
  await admin.save({ validateBeforeSave: false });

  // Create reset url
  const frontendUrl = process.env.FRONTEND_URL || "https://lib-frontend-j0e9.vercel.app";
  const resetUrl = `${frontendUrl}/admin/reset-password/${resetToken}`;

  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please use the following link to reset your password: \n\n ${resetUrl}`;

  try {
    await sendEmail(admin.email, "Password Reset Token", message);

    res.status(200).json(new ApiResponse(200, {}, "Email sent"));
  } catch (err) {
    console.error(err);
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;

    await admin.save({ validateBeforeSave: false });

    throw new ApiError(500, "Email could not be sent");
  }
});

/**
 * @desc    Reset Password
 * @route   PUT /api/v1/admin/reset-password/:token
 * @access  Public
 */
export const resetPassword = asyncHandler(async (req, res) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const admin = await Admin.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!admin) {
    throw new ApiError(400, "Invalid token");
  }

  // Set new password
  admin.password = req.body.password;
  admin.resetPasswordToken = undefined;
  admin.resetPasswordExpire = undefined;

  await admin.save();

  return res.status(200).json(new ApiResponse(200, {}, "Password updated"));
});
