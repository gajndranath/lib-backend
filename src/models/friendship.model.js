import mongoose, { Schema } from "mongoose";

const friendshipSchema = new Schema(
  {
    studentA: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentB: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    bondedAt: {
      type: Date,
      default: Date.now,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Ensure studentA is always the "smaller" ID to keep relationships unique and non-duplicate
friendshipSchema.pre("save", function (next) {
  if (this.studentA.toString() > this.studentB.toString()) {
    const temp = this.studentA;
    this.studentA = this.studentB;
    this.studentB = temp;
  }
  next();
});

// Compound index to ensure uniqueness regardless of who initiated
friendshipSchema.index({ studentA: 1, studentB: 1 }, { unique: true });

export const Friendship = mongoose.model("Friendship", friendshipSchema);
