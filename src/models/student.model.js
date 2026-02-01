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
      required: true,
    },
    seatNumber: {
      type: String,
      trim: true,
    },

    // Financial
    monthlyFee: {
      type: Number,
      required: true,
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
      default: StudentStatus.ACTIVE,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
      required: true,
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
studentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
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
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },
  );
};

// Method to reactivate
studentSchema.methods.reactivate = function () {
  this.status = StudentStatus.ACTIVE;
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

// Pre-save hook to validate seat availability
studentSchema.pre("save", async function () {
  // Only validate if slotId or status is being modified
  if (this.isModified("slotId") || this.isModified("status")) {
    // Only validate for active students
    if (this.status === "ACTIVE") {
      try {
        const Slot = mongoose.model("Slot");
        const slot = await Slot.findById(this.slotId);

        if (slot) {
          const occupiedSeats = await mongoose.model("Student").countDocuments({
            slotId: this.slotId,
            status: "ACTIVE",
            _id: { $ne: this._id },
          });

          if (occupiedSeats >= slot.totalSeats) {
            // Throw error instead of calling next()
            throw new Error(`Slot "${slot.name}" is full. No seats available.`);
          }
        }
      } catch (error) {
        // Re-throw the error for Mongoose to catch
        throw error;
      }
    }
  }
  // No need to call next() in async middleware
});

export const Student = mongoose.model("Student", studentSchema);
