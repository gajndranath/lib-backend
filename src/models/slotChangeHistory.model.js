import mongoose, { Schema } from "mongoose";

const slotChangeHistorySchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    previousSlotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
      required: true,
    },
    previousSlotName: {
      type: String,
      required: true,
    },
    newSlotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
      required: true,
    },
    newSlotName: {
      type: String,
      required: true,
    },
    changeType: {
      type: String,
      enum: ["ADMIN_INITIATED", "STUDENT_REQUESTED", "STUDENT_APPROVED"],
      default: "ADMIN_INITIATED",
    },
    changedBy: {
      // Admin ID if admin initiated, Student ID if student requested
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    changedByRole: {
      type: String,
      enum: ["ADMIN", "STUDENT"],
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      previousTimeRange: {
        start: String,
        end: String,
      },
      newTimeRange: {
        start: String,
        end: String,
      },
      previousMonthlyFee: Number,
      newMonthlyFee: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Index for quick lookups
slotChangeHistorySchema.index({ studentId: 1, createdAt: -1 });
slotChangeHistorySchema.index({ changedBy: 1, createdAt: -1 });
slotChangeHistorySchema.index({ changeType: 1 });

export const SlotChangeHistory = mongoose.model(
  "SlotChangeHistory",
  slotChangeHistorySchema,
);
