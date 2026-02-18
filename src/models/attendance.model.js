import mongoose, { Schema } from "mongoose";

const attendanceSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      description: "Date of attendance (normalized to midnight UTC)",
    },
    status: {
      type: String,
      enum: ["PRESENT", "ABSENT", "HALF_DAY"],
      default: "PRESENT",
      required: true,
    },
    checkInTime: {
      type: Date,
    },
    checkOutTime: {
      type: Date,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate attendance records for the same student on the same day
attendanceSchema.index({ tenantId: 1, studentId: 1, date: 1 }, { unique: true });

// Index for querying daily attendance
attendanceSchema.index({ tenantId: 1, date: 1 });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
