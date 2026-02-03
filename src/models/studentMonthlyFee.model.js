import mongoose, { Schema } from "mongoose";

const studentMonthlyFeeSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    month: {
      type: Number, // 0-11
      required: true,
      min: 0,
      max: 11,
    },
    year: {
      type: Number,
      required: true,
    },
    baseFee: {
      type: Number,
      required: true,
      min: 0,
      get: (value) => {
        // Round to 2 decimal places when retrieving
        return Math.round(value * 100) / 100;
      },
      set: (value) => {
        // Round to 2 decimal places when setting
        return Math.round(value * 100) / 100;
      },
    },
    status: {
      type: String,
      enum: ["PAID", "DUE", "PENDING"],
      default: "PENDING",
      required: true,
    },
    coveredByAdvance: {
      type: Boolean,
      default: false,
    },
    dueCarriedForwardAmount: {
      type: Number,
      default: 0,
      min: 0,
      get: (value) => {
        // Round to 2 decimal places when retrieving
        return Math.round(value * 100) / 100;
      },
      set: (value) => {
        // Round to 2 decimal places when setting
        return Math.round(value * 100) / 100;
      },
    },
    locked: {
      type: Boolean,
      default: false,
    },
    paymentDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "ONLINE", "CHEQUE", "OTHER"],
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
      get: (value) => {
        // Round to 2 decimal places when retrieving
        return Math.round(value * 100) / 100;
      },
      set: (value) => {
        // Round to 2 decimal places when setting
        return Math.round(value * 100) / 100;
      },
    },

    // Audit fields
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
    toJSON: { virtuals: true },
  },
);

// Unique compound index
studentMonthlyFeeSchema.index(
  { studentId: 1, month: 1, year: 1 },
  { unique: true, name: "unique_monthly_fee" },
);

// Indexes for queries
studentMonthlyFeeSchema.index({ status: 1 });
studentMonthlyFeeSchema.index({ month: 1, year: 1 });
studentMonthlyFeeSchema.index({ locked: 1 });
studentMonthlyFeeSchema.index({ coveredByAdvance: 1 });

// Virtual for month-year string
studentMonthlyFeeSchema.virtual("monthYear").get(function () {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[this.month]} ${this.year}`;
});

// Virtual for total amount
studentMonthlyFeeSchema.virtual("totalAmount").get(function () {
  const total = this.baseFee + this.dueCarriedForwardAmount;
  // Round to 2 decimal places
  return Math.round(total * 100) / 100;
});

// Method to mark as paid
studentMonthlyFeeSchema.methods.markAsPaid = function (paymentData) {
  if (this.locked) {
    throw new Error("This month is locked and cannot be modified");
  }

  this.status = "PAID";
  this.paymentDate = new Date();
  this.paymentMethod = paymentData.method;
  this.transactionId = paymentData.transactionId;
  this.remarks = paymentData.remarks;
  this.locked = true; // Once paid, lock it

  return this.save();
};

export const StudentMonthlyFee = mongoose.model(
  "StudentMonthlyFee",
  studentMonthlyFeeSchema,
);
