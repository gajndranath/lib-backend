import mongoose, { Schema } from "mongoose";

const advanceBalanceSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
      index: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    monthsCovered: [
      {
        type: String, // Format: "YYYY-MM"
        index: true,
      },
    ],
    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    lastAppliedMonth: {
      month: Number,
      year: Number,
    },

    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Method to add advance
advanceBalanceSchema.methods.addAdvance = function (amount, adminId) {
  this.totalAmount += amount;
  this.remainingAmount += amount;
  this.updatedBy = adminId;

  return this.save();
};

// Method to apply to a specific month
advanceBalanceSchema.methods.applyToMonth = function (month, year, amount) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Check if already covered
  if (this.monthsCovered.includes(monthKey)) {
    throw new Error(`Month ${monthKey} is already covered by advance`);
  }

  if (amount > this.remainingAmount) {
    throw new Error(
      `Insufficient advance balance. Required: ${amount}, Available: ${this.remainingAmount}`
    );
  }

  this.remainingAmount -= amount;
  this.monthsCovered.push(monthKey);
  this.lastAppliedMonth = { month, year };

  return this.save();
};

export const AdvanceBalance = mongoose.model(
  "AdvanceBalance",
  advanceBalanceSchema
);
