import mongoose, { Schema } from "mongoose";

const friendRequestSchema = new Schema(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
  },
  { timestamps: true },
);

friendRequestSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

export const FriendRequest = mongoose.model(
  "FriendRequest",
  friendRequestSchema,
);
