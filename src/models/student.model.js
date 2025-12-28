import mongoose, { Schema } from "mongoose";
import { StudentStatus } from "../constants/constants.js";

const studentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, trim: true },
    joiningDate: { type: Date, default: Date.now },
    monthlyFees: { type: Number, required: true, min: 0 },
    address: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(StudentStatus),
      default: StudentStatus.ACTIVE,
    },
    billingDay: { type: Number, required: true, min: 1, max: 31 },
    reminderPaused: { type: Boolean, default: false },
    pauseReminderUntil: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

// Indexes
studentSchema.index({ phone: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ billingDay: 1 });
studentSchema.index({ reminderPaused: 1 });
studentSchema.index({ isDeleted: 1 });

// Virtual for full name (if needed)
studentSchema.virtual("fullName").get(function () {
  return this.name;
});

// Method to soft delete
studentSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status = StudentStatus.ARCHIVED;
  return this.save();
};

// Method to reactivate
studentSchema.methods.reactivate = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.status = StudentStatus.ACTIVE;
  return this.save();
};

export const Student = mongoose.model("Student", studentSchema);
