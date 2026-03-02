import mongoose, { Schema } from "mongoose";
import { ReportReason, ReportStatus } from "../constants/constants.js";

const userReportSchema = new Schema(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    reportedId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: Object.values(ReportReason),
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    evidence: [
      {
        type: String, // URLs to screenshots or message IDs
      },
    ],
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.PENDING,
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    resolvedAt: {
      type: Date,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Prevent duplicate reports for same target within a short period (e.g., 24h) to avoid spamming the report system?
// For now, simple unique index on reporter + target + status=PENDING
userReportSchema.index(
  { reporterId: 1, reportedId: 1, status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: "PENDING" } 
  }
);

export const UserReport = mongoose.model("UserReport", userReportSchema);
