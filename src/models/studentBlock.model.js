import mongoose, { Schema } from "mongoose";

const studentBlockSchema = new Schema(
  {
    blockerId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    blockedId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

studentBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

export const StudentBlock = mongoose.model("StudentBlock", studentBlockSchema);
