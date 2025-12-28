import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";

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

const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.admin._id).select("-password");
  if (!admin) throw new ApiError(404, "Admin not found");

  return res
    .status(200)
    .json(new ApiResponse(200, admin, "Admin profile fetched"));
});

const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  const admin = await Admin.findByIdAndUpdate(
    req.admin._id,
    { notificationPreferences: preferences },
    { new: true }
  ).select("-password");

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

export { loginAdmin, getAdminProfile, updateNotificationPreferences };
