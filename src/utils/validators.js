import { z } from "zod";

export const studentRegistrationSchema = z.object({
  name: z.string().min(2).max(50),
  phone: z.string().regex(/^[0-9]{10}$/, "Invalid phone number"),
  email: z.string().email().optional(),
  monthlyFees: z.number().positive(),
  joiningDate: z.string().optional(),
  billingDay: z.number().min(1).max(31).optional(),
  address: z.string().optional(),
});

export const paymentUpdateSchema = z.object({
  studentId: z.string(),
  month: z.number().min(0).max(11),
  year: z.number(),
  status: z.enum(["PAID", "UNPAID", "PARTIAL", "ADVANCE"]),
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
