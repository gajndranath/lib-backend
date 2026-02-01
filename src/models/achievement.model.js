import mongoose, { Schema } from "mongoose";

const achievementSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: String,
      enum: ["ACADEMIC", "SPORTS", "CULTURAL", "OTHER"],
      default: "ACADEMIC",
    },
    evidenceUrl: {
      type: String,
      trim: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    verifiedAt: {
      type: Date,
    },

    // Metadata
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
achievementSchema.index({ studentId: 1, date: -1 });
achievementSchema.index({ category: 1 });
achievementSchema.index({ verified: 1 });

export const Achievement = mongoose.model("Achievement", achievementSchema);
