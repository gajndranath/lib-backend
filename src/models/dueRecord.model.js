import mongoose, { Schema } from "mongoose";

const dueRecordSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    monthsDue: [
      {
        type: String, // Format: "YYYY-MM"
        required: true,
        index: true,
      },
    ],
    totalDueAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    reminderDate: {
      type: Date,
      required: true,
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolutionDate: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
    },

    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient due reminder queries
dueRecordSchema.index({ reminderDate: 1, resolved: 1 });

// Method to resolve due
dueRecordSchema.methods.resolve = function (adminId, remarks) {
  this.resolved = true;
  this.resolutionDate = new Date();
  this.resolvedBy = adminId;
  this.remarks = remarks
    ? `${this.remarks}\nResolved on ${new Date().toISOString()}: ${remarks}`
    : `Resolved on ${new Date().toISOString()}`;

  return this.save();
};

export const DueRecord = mongoose.model("DueRecord", dueRecordSchema);
