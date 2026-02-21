import mongoose, { Schema } from "mongoose";

const roomSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      trim: true,
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
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
roomSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roomSchema.index({ tenantId: 1, isActive: 1 });

export const Room = mongoose.model("Room", roomSchema);
