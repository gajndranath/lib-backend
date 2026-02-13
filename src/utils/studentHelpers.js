import { Student } from "../models/student.model.js";
import crypto from "crypto";

/**
 * Generate unique library ID for new student
 */
export const generateLibraryId = async () => {
  const lastStudent = await Student.findOne({ isDeleted: false })
    .sort({ createdAt: -1 })
    .select("libraryId");

  if (lastStudent && lastStudent.libraryId) {
    const lastIdNumber = parseInt(lastStudent.libraryId.replace(/\D/g, ""));
    return `LIB${String(lastIdNumber + 1).padStart(4, "0")}`;
  }

  return "LIB0001";
};

/**
 * Generate 6-digit OTP
 */
export const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Hash OTP for secure storage
 */
export const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

/**
 * Check if email exists (case-insensitive)
 */
export const checkEmailExists = async (email) => {
  return await Student.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  });
};

/**
 * Check if phone exists
 */
export const checkPhoneExists = async (phone) => {
  return await Student.findOne({
    phone,
    isDeleted: false,
  });
};
