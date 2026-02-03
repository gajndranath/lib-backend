import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Admin } from "../models/admin.model.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) throw new ApiError(401, "Unauthorized request");

    // Verify token signature and expiry
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new ApiError(401, "Access token expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new ApiError(401, "Invalid access token");
      }
      throw error;
    }

    const admin = await Admin.findById(decodedToken?._id).select("-password");

    if (!admin) throw new ApiError(401, "Invalid Access Token");

    // Check if admin is active
    if (!admin.isActive) throw new ApiError(403, "Admin account is inactive");

    req.admin = admin;
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});

export const authorizeRoles = (...roles) => {
  return (req, _, next) => {
    if (!roles.includes(req.admin.role)) {
      throw new ApiError(
        403,
        `Role: ${req.admin.role} is not allowed to access this resource`,
      );
    }
    next();
  };
};
