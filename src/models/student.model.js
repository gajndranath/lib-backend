import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { StudentStatus } from "../constants/constants.js";
import { Slot } from "./slot.model.js";
const studentSchema = new Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    libraryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    otpHash: {
      type: String,
    },
    otpExpiresAt: {
      type: Date,
    },
    otpPurpose: {
      type: String,
      enum: ["LOGIN", "RESET", "VERIFY"],
    },
    address: {
      type: String,
      trim: true,
    },
    fatherName: {
      type: String,
      trim: true,
    },

    // Academic Info
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
      required: false, // ✅ Optional - assigned by admin later
    },
    seatNumber: {
      type: String,
      trim: true,
    },

    // Financial
    monthlyFee: {
      type: Number,
      default: 0, // ✅ Default to 0 for self-registration
      min: 0,
    },
    feeOverride: {
      type: Boolean,
      default: false,
    },

    // Status & Dates
    status: {
      type: String,
      enum: Object.values(StudentStatus),
      default: StudentStatus.INACTIVE, // ✅ Default INACTIVE until admin approves
    },
    joiningDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    billingDay: {
      type: Number,
      min: 1,
      max: 31,
      required: false, // ✅ Optional - set when slot assigned
    },
    nextBillingDate: {
      type: Date,
      required: false, // ✅ Optional - calculated when slot assigned
    },
    leavingDate: {
      type: Date,
    },

    // System Fields
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Push Notification Settings
    webPushSubscription: {
      type: Schema.Types.Mixed,
    },
    fcmToken: {
      type: String,
    },
    publicKey: {
      type: String,
      trim: true,
    },
    previousPublicKey: {
      type: String,
      trim: true,
    },
    publicKeyRotatedAt: {
      type: Date,
    },
    encryptedPrivateKey: {
      type: String,
      trim: true,
    },
    keyBackupSalt: {
      type: String,
      trim: true,
    },
    keyBackupIv: {
      type: String,
      trim: true,
    },
    keyBackupVersion: {
      type: Number,
      default: 1,
    },
    keyBackupUpdatedAt: {
      type: Date,
    },

    // Metadata
    notes: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    refreshToken: { type: String, select: false },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Indexes
studentSchema.index({ slotId: 1, status: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ isDeleted: 1 });
studentSchema.index({ joiningDate: -1 });

// Virtual for full month name
studentSchema.virtual("joiningMonth").get(function () {
  return this.joiningDate
    ? this.joiningDate.toLocaleString("default", { month: "long" })
    : null;
});

// Method to archive student (never delete)
studentSchema.methods.archive = function (reason) {
  this.status = StudentStatus.ARCHIVED;
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.notes = this.notes
    ? `${this.notes}\nArchived on ${new Date().toISOString()}: ${reason}`
    : `Archived: ${reason}`;
  return this.save();
};

// Password hashing before saving
studentSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Set billing day and next billing date for new students
studentSchema.pre("save", async function () {
  if (this.isNew && this.joiningDate) {
    // Set billing day to the day of joining date
    this.billingDay = this.joiningDate.getDate();

    // Calculate next billing date (one month from joining)
    const nextDate = new Date(this.joiningDate);
    nextDate.setMonth(nextDate.getMonth() + 1);

    // Handle edge case: if joining day is 31 but next month has fewer days
    // For example, joining on Jan 31, next billing is Feb 28/29
    const maxDayInNextMonth = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0,
    ).getDate();

    if (this.billingDay > maxDayInNextMonth) {
      nextDate.setDate(maxDayInNextMonth);
    } else {
      nextDate.setDate(this.billingDay);
    }

    this.nextBillingDate = nextDate;
  }
});

// Password verification method
studentSchema.methods.isPasswordCorrect = async function (password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// Token Generation Method
studentSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      userType: "Student",
      tenantId: this.tenantId,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },
  );
};

// Refresh Token Generation Method
studentSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, userType: "Student" },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" },
  );
};

// Method to reactivate
studentSchema.methods.reactivate = function () {
  this.status = StudentStatus.ACTIVE;
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

// Performance Indexes for common queries
// Composite index for slot capacity checks
studentSchema.index({ slotId: 1, status: 1, isDeleted: 1 });

// Index for student lookup by status
studentSchema.index({ status: 1, isDeleted: 1 });

// Index for deleted students queries
studentSchema.index({ isDeleted: 1, deletedAt: 1 });

// Index for date range queries
studentSchema.index({ joiningDate: 1 });
studentSchema.index({ createdAt: 1 });

export const Student = mongoose.model("Student", studentSchema);
