import { z } from "zod";
import xss from "xss";

// XSS sanitization helper
export const sanitizeString = (str) => {
  if (!str || typeof str !== "string") return str;
  return xss(str.trim(), {
    whiteList: {},
    stripIgnoredTag: true,
  });
};

// Common validation patterns
const patterns = {
  phone: /^\d{10}$/,
  mongodb: /^[0-9a-f]{24}$/i,
  url: /^https?:\/\/.+/,
  slug: /^[a-z0-9-]+$/,
};

export const studentRegistrationSchema = z
  .object({
    // Basic Info
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be less than 100 characters")
      .transform(sanitizeString),
    phone: z.string().regex(patterns.phone, "Phone must be exactly 10 digits"),
    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email must be less than 255 characters")
      .optional()
      .or(z.literal("")),
    address: z
      .string()
      .max(255, "Address must be less than 255 characters")
      .transform(sanitizeString)
      .optional(),
    fatherName: z
      .string()
      .max(100, "Father name must be less than 100 characters")
      .transform(sanitizeString)
      .optional(),

    // Academic Info
    slotId: z
      .string()
      .regex(patterns.mongodb, "Invalid slot ID format")
      .min(1, "Slot is required"),
    seatNumber: z
      .string()
      .max(50, "Seat number must be less than 50 characters")
      .optional(),

    // Financial
    monthlyFee: z
      .number()
      .min(0, "Monthly fee must be positive")
      .max(1000000, "Monthly fee seems too high"),

    // Dates
    joiningDate: z.string().datetime().optional(),

    // Metadata
    notes: z
      .string()
      .max(500, "Notes must be less than 500 characters")
      .transform(sanitizeString)
      .optional(),
    tags: z
      .array(z.string().max(50))
      .max(10, "Maximum 10 tags allowed")
      .optional(),

    // Status & Verification (from Admin Dashboard)
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
    emailVerified: z.boolean().optional(),
    phoneVerified: z.boolean().optional(),
  })
  .passthrough();

export const studentUpdateSchema = studentRegistrationSchema.partial();

export const paymentUpdateSchema = z.object({
  studentId: z.string().regex(patterns.mongodb, "Invalid student ID format"),
  month: z
    .number()
    .min(0, "Month must be between 0-11")
    .max(11, "Month must be between 0-11"),
  year: z
    .number()
    .min(2000, "Year must be 2000 or later")
    .max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  status: z.enum(["PAID", "DUE", "PENDING"], {
    errorMap: () => ({ message: "Invalid payment status" }),
  }),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(1000000, "Amount seems too high")
    .optional(),
  remarks: z
    .string()
    .max(500, "Remarks must be less than 500 characters")
    .transform(sanitizeString)
    .optional(),
});

export const adminLoginSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(255, "Password is too long"),
});

export const adminRegisterSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be less than 30 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Username can only contain lowercase letters, numbers, and underscores",
    ),
  email: z
    .string()
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z
    .enum(["SUPER_ADMIN", "STAFF"], {
      errorMap: () => ({ message: "Invalid role" }),
    })
    .optional(),
});

export const notificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sound: z.boolean().optional(),
  vibration: z.boolean().optional(),
});
