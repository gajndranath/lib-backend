import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import AdminService from "../services/admin.service.js";
import StudentService from "../services/student.service.js";
import { invalidateAdminCache } from "../middlewares/auth.middleware.js";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Zod validation schema with stricter rules
const registerAdminSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Username can only contain lowercase letters, numbers, and underscores",
    ),
  email: z.string().email("Invalid email format").max(255, "Email is too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.enum(["SUPER_ADMIN", "STAFF"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// EXISTING FUNCTION: Login Admin
const loginAdmin = asyncHandler(async (req, res) => {
  // Validate input
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation error", validation.error.errors);
  }

  const { email, password } = validation.data;

  const admin = await Admin.findOne({ email });
  if (!admin) throw new ApiError(401, "Invalid email or password");

  const isPasswordValid = await admin.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid email or password");

  if (!admin.isActive) throw new ApiError(403, "Admin account is inactive");

  const accessToken = admin.generateAccessToken();
  const refreshToken = admin.generateRefreshToken();

  // Save refresh token to DB (hashed storage not needed — it's already a signed JWT)
  await Admin.findByIdAndUpdate(admin._id, {
    refreshToken,
    lastLogin: new Date(),
  });

  // Force cache invalidation to ensure next request fetches fresh data (e.g. if status changed)
  await invalidateAdminCache(admin._id.toString());

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  const adminResponse = await Admin.findById(admin._id).select(
    "-password -refreshToken",
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 })
    .cookie("refreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json(
      new ApiResponse(
        200,
        { admin: adminResponse, accessToken },
        "Login successful",
      ),
    );
});

// MISSING FUNCTION: Get Admin Profile - ADD THIS
const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await AdminService.getAdminProfile(req.admin._id);

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Admin profile fetched"));
});

// MISSING FUNCTION: Update Notification Preferences - ADD THIS
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  const admin = await AdminService.updateAdminProfile(req.admin._id, {
    notificationPreferences: preferences,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        admin,
        "Notification preferences updated successfully",
      ),
    );
});

// NEW FUNCTION: Register Admin
const registerAdmin = asyncHandler(async (req, res) => {
  // 1. Validate input
  const validation = registerAdminSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { username, email, password, role = "STAFF" } = validation.data;

  // 2. Check if admin already exists
  const existedAdmin = await Admin.findOne({
    $or: [{ username }, { email }],
  });

  if (existedAdmin) {
    if (existedAdmin.username === username) {
      throw new ApiError(409, "Username already exists");
    }
    if (existedAdmin.email === email) {
      throw new ApiError(409, "Email already exists");
    }
  }

  // 3. Create new admin via service
  const admin = await AdminService.createAdmin(
    { username, email, password, role },
    req.admin._id,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, admin, "Admin registered successfully"));
});

// NEW FUNCTION: Get all admins
const getAllAdmins = asyncHandler(async (req, res) => {
  const admins = await AdminService.getAllAdmins();

  return res
    .status(200)
    .json(new ApiResponse(200, admins, "Admins list fetched"));
});

// NEW FUNCTION: Update admin
const updateAdmin = asyncHandler(async (req, res) => {
  const { adminId } = req.params;
  const { role, isActive } = req.body;

  // Cannot update yourself
  if (adminId === req.admin._id.toString()) {
    throw new ApiError(400, "Cannot update your own account");
  }

  const updateData = {};
  if (role) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  const admin = await AdminService.updateAdmin(
    adminId,
    updateData,
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Admin updated successfully"));
});

// NEW FUNCTION: Update own profile
const updateOwnProfile = asyncHandler(async (req, res) => {
  const { username, email, phone } = req.body;

  const updateData = {};
  if (username) updateData.username = username;
  if (email) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;

  // Check if email or username already exists (if being changed)
  if (email && email !== req.admin.email) {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      throw new ApiError(400, "Email already in use");
    }
  }

  if (username && username !== req.admin.username) {
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      throw new ApiError(400, "Username already in use");
    }
  }

  const admin = await AdminService.updateAdminProfile(
    req.admin._id,
    updateData,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Profile updated successfully"));
});

// NEW FUNCTION: Change password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current password and new password are required");
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  await AdminService.changePassword(
    req.admin._id,
    currentPassword,
    newPassword,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password changed successfully"));
});

// NEW FUNCTION: Delete admin
const deleteAdmin = asyncHandler(async (req, res) => {
  const { adminId } = req.params;

  // Cannot delete yourself
  if (adminId === req.admin._id.toString()) {
    throw new ApiError(400, "Cannot delete your own account");
  }

  const admin = await AdminService.deleteAdmin(adminId, req.admin._id);

  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Admin deleted successfully"));
});

// Refresh admin tokens (rotate refresh token)
const refreshAdmin = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  // Fetch admin and verify stored token matches (rotation check)
  const admin = await Admin.findById(decoded._id).select("+refreshToken");
  if (!admin || admin.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, "Refresh token reuse detected or token invalid");
  }

  if (!admin.isActive) throw new ApiError(403, "Admin account is inactive");

  // Issue new token pair
  const newAccessToken = admin.generateAccessToken();
  const newRefreshToken = admin.generateRefreshToken();

  // Rotate: save new refresh token, invalidate old one
  await Admin.findByIdAndUpdate(admin._id, { refreshToken: newRefreshToken });

  // Invalidate Redis cache so next request fetches fresh admin data
  await invalidateAdminCache(admin._id.toString());

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  };

  return res
    .status(200)
    .cookie("accessToken", newAccessToken, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 })
    .cookie("refreshToken", newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json(new ApiResponse(200, { accessToken: newAccessToken }, "Tokens refreshed"));
});

// Logout Admin
const logoutAdmin = asyncHandler(async (req, res) => {
  // Invalidate the Redis admin cache so the next request hits the DB
  if (req.admin?._id) {
    // Clear refresh token from DB
    await Admin.findByIdAndUpdate(req.admin._id, { refreshToken: null });
    await invalidateAdminCache(req.admin._id.toString());
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

// NEW FUNCTION: Get audit logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const { search = "", action = "all", page = "1", limit = "20" } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const filters = {};

  if (action && action !== "all") {
    filters.action = action;
  }

  const result = await AdminService.getActionLogs(
    filters,
    parsedPage,
    parsedLimit,
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs: result.data,
        pagination: result.pagination,
      },
      "Audit logs fetched",
    ),
  );
});

// Export ALL functions
export {
  loginAdmin,
  logoutAdmin,
  refreshAdmin,
  getAdminProfile,
  updateNotificationPreferences,
  registerAdmin,
  getAllAdmins,
  updateAdmin,
  updateOwnProfile,
  changePassword,
  deleteAdmin,
  getAuditLogs,
};
