import mongoose, { Schema } from "mongoose";

/**
 * Library — the tenant root model.
 * Each physical library / branch is one tenant.
 * All data (students, slots, fees, etc.) is scoped to a Library via tenantId.
 */
const librarySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens",
      ],
    },
    ownerAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    // New fields for Library Settings
    website: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    
    // SaaS / Business Rules
    settings: {
      gracePeriodDays: { type: Number, default: 5 }, // Days before late fee applies
      lateFeePerDay: { type: Number, default: 10 }, // Amount in currency
      maxStudents: { type: Number, default: 100 },
      maxAdmins: { type: Number, default: 5 },
      timezone: { type: String, default: "Asia/Kolkata" },
      currency: { type: String, default: "INR" },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
// Note: slug unique index is created automatically by unique:true on the field
librarySchema.index({ isActive: 1 });
librarySchema.index({ ownerAdminId: 1 });

export const Library = mongoose.model("Library", librarySchema);
