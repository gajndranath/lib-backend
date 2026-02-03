import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
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

  // Check if admin is active
  if (!admin.isActive) throw new ApiError(403, "Admin account is inactive");

  const accessToken = admin.generateAccessToken();

  // Set secure cookie options based on environment
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Only secure in production
    sameSite: "Strict", // Stricter CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Update last login
  await Admin.findByIdAndUpdate(admin._id, { lastLogin: new Date() });

  const adminResponse = await Admin.findById(admin._id).select(
    "-password -refreshToken",
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
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
  const admin = await Admin.findById(req.admin._id).select("-password");
  if (!admin) throw new ApiError(404, "Admin not found");

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Admin profile fetched"));
});

// MISSING FUNCTION: Update Notification Preferences - ADD THIS
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  const admin = await Admin.findByIdAndUpdate(
    req.admin._id,
    { notificationPreferences: preferences },
    { new: true },
  ).select("-password");

  if (!admin) throw new ApiError(404, "Admin not found");

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

  // 3. Create new admin
  const admin = await Admin.create({
    username,
    email,
    password,
    role: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "STAFF",
    isActive: true,
  });

  // 4. Remove password from response
  const createdAdmin = await Admin.findById(admin._id).select("-password");

  return res
    .status(201)
    .json(new ApiResponse(201, createdAdmin, "Admin registered successfully"));
});

// NEW FUNCTION: Get all admins
const getAllAdmins = asyncHandler(async (req, res) => {
  const admins = await Admin.find({}).select("-password -refreshToken");

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

  const admin = await Admin.findByIdAndUpdate(adminId, updateData, {
    new: true,
  }).select("-password");

  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

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

  const admin = await Admin.findByIdAndUpdate(req.admin._id, updateData, {
    new: true,
  }).select("-password -refreshToken");

  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

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

  const admin = await Admin.findById(req.admin._id);
  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  const isPasswordValid = await admin.isPasswordCorrect(currentPassword);
  if (!isPasswordValid) {
    throw new ApiError(401, "Current password is incorrect");
  }

  admin.password = newPassword;
  await admin.save();

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

  const admin = await Admin.findByIdAndDelete(adminId);

  if (!admin) {
    throw new ApiError(404, "Admin not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Admin deleted successfully"));
});

// NEW FUNCTION: Get audit logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const { search = "", action = "all", page = "1", limit = "20" } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const filter = {};

  if (action && action !== "all") {
    if (["CREATE", "UPDATE", "DELETE"].includes(action)) {
      filter.action = { $regex: `^${action}`, $options: "i" };
    } else {
      filter.action = action;
    }
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");
    filter.$or = [
      { action: searchRegex },
      { targetEntity: searchRegex },
      { ipAddress: searchRegex },
    ];
  }

  const totalLogs = await AdminActionLog.countDocuments(filter);
  const logs = await AdminActionLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit)
    .populate("adminId", "username email");

  const mapped = logs.map((log) => ({
    _id: log._id,
    admin: log.adminId
      ? {
          _id: log.adminId._id,
          username: log.adminId.username,
          email: log.adminId.email,
        }
      : { _id: null, username: "System", email: "" },
    action: log.action,
    target: log.targetEntity,
    targetId: log.targetId,
    changes: { before: log.oldValue ?? {}, after: log.newValue ?? {} },
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    timestamp: log.createdAt,
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs: mapped,
        totalLogs,
        totalPages: Math.max(Math.ceil(totalLogs / parsedLimit), 1),
      },
      "Audit logs fetched",
    ),
  );
});

// Export ALL functions
export {
  loginAdmin,
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
