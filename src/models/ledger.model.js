import mongoose, { Schema } from "mongoose";
import { PaymentStatus } from "../constants/constants.js";

const ledgerSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    billingMonth: { type: Number, required: true, min: 0, max: 11 },
    billingYear: { type: Number, required: true },
    dueAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.UNPAID,
    },
    paymentDate: { type: Date },
    carryForwardAmount: { type: Number, default: 0 },
    remarks: { type: String, trim: true },
    lastReminderSent: { type: Date },
    reminderCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexing for fast search
ledgerSchema.index(
  { studentId: 1, billingMonth: 1, billingYear: 1 },
  { unique: true }
);

ledgerSchema.index({ paymentStatus: 1 });
ledgerSchema.index({ billingYear: 1, billingMonth: 1 });
ledgerSchema.index({ paymentDate: 1 });

// Virtual for month name
ledgerSchema.virtual("monthName").get(function () {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[this.billingMonth];
});

// Virtual for pending amount
ledgerSchema.virtual("pendingAmount").get(function () {
  return this.dueAmount - this.paidAmount;
});

export const Ledger = mongoose.model("Ledger", ledgerSchema);
