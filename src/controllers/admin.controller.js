import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";
import { z } from "zod";

// Zod validation schema
const registerAdminSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["SUPER_ADMIN", "STAFF"]).optional(),
});

// EXISTING FUNCTION: Login Admin
const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and password are required");

  const admin = await Admin.findOne({ email });
  if (!admin) throw new ApiError(404, "Admin does not exist");

  const isPasswordValid = await admin.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid credentials");

  const accessToken = admin.generateAccessToken();
  const options = { httpOnly: true, secure: true, sameSite: "None" };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .json(new ApiResponse(200, { admin, accessToken }, "Login successful"));
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
    { new: true }
  ).select("-password");

  if (!admin) throw new ApiError(404, "Admin not found");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        admin,
        "Notification preferences updated successfully"
      )
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

// Export ALL functions
export {
  loginAdmin,
  getAdminProfile,
  updateNotificationPreferences,
  registerAdmin,
  getAllAdmins,
  updateAdmin,
  deleteAdmin,
};
