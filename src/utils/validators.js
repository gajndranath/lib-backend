import { z } from "zod";

export const studentRegistrationSchema = z
  .object({
    // Basic Info
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    address: z.string().optional(),
    fatherName: z.string().optional(),

    // Academic Info
    slotId: z.string().min(1, "Slot is required"),
    seatNumber: z.string().optional(),

    // Financial
    monthlyFee: z.number().min(0, "Monthly fee must be positive"),

    // Dates
    joiningDate: z.string().optional(),

    // Metadata
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export const paymentUpdateSchema = z.object({
  studentId: z.string(),
  month: z.number().min(0).max(11),
  year: z.number(),
  status: z.enum(["PAID", "DUE", "PENDING"]), // Match your actual enum values
  amount: z.number().positive().optional(),
  remarks: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const notificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sound: z.boolean().optional(),
  vibration: z.boolean().optional(),
});
