import mongoose, { Schema } from "mongoose";

const slotSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    timeRange: {
      start: { type: String, required: true }, // Format: "09:00"
      end: { type: String, required: true },
    },
    monthlyFee: {
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
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
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
    toJSON: { virtuals: true },
  },
);

// Virtual for occupied seats (calculated from active students)
slotSchema.virtual("occupiedSeats", {
  ref: "Student",
  localField: "_id",
  foreignField: "slotId",
  count: true,
  match: { status: "ACTIVE" },
});

// Virtual for available seats
slotSchema.virtual("availableSeats").get(function () {
  return Math.max(0, this.totalSeats - (this.occupiedSeats || 0));
});

// Indexes
slotSchema.index({ tenantId: 1, name: 1 }, { unique: true }); // Unique per tenant
slotSchema.index({ tenantId: 1, isActive: 1 });
slotSchema.index({ isActive: 1, totalSeats: 1 });

export const Slot = mongoose.model("Slot", slotSchema);
