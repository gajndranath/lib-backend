import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Student } from "../models/student.model.js";

export const verifyStudentJWT = asyncHandler(async (req, _res, next) => {
  try {
    const token =
      req.cookies?.studentAccessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    // ...existing code...
    if (!token) throw new ApiError(401, "Unauthorized request");

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      // ...existing code...
      throw error;
    }
    const student = await Student.findById(decodedToken?._id).select(
      "-password -otpHash -otpExpiresAt -otpPurpose",
    );

    if (!student) throw new ApiError(401, "Invalid Access Token");

    req.student = student;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
