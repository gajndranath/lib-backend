import mongoose, { Schema } from "mongoose";

const adminActionLogSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE_STUDENT",
        "UPDATE_STUDENT",
        "ARCHIVE_STUDENT",
        "REACTIVATE_STUDENT",
        "CREATE_SLOT",
        "UPDATE_SLOT",
        "DELETE_SLOT",
        "MARK_PAID",
        "MARK_DUE",
        "ADD_ADVANCE",
        "CHANGE_SLOT",
        "OVERRIDE_FEE",
        "CREATE_ADMIN",
        "UPDATE_ADMIN",
        "DELETE_ADMIN",
        "GENERATE_MONTHLY_FEES",
        "GENERATE_PERSONALIZED_FEES",
        "APPLY_ADVANCE",
      ],
      index: true,
    },
    targetEntity: {
      type: String,
      required: true,
      enum: ["STUDENT", "SLOT", "FEE", "ADMIN", "REMINDER", "ADVANCE", "SYSTEM"],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    oldValue: {
      type: Schema.Types.Mixed,
    },
    newValue: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for audit queries
adminActionLogSchema.index({ createdAt: -1 });
adminActionLogSchema.index({ adminId: 1, createdAt: -1 });
adminActionLogSchema.index({ targetEntity: 1, targetId: 1 });

export const AdminActionLog = mongoose.model(
  "AdminActionLog",
  adminActionLogSchema,
);
