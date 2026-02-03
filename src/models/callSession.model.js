import mongoose, { Schema } from "mongoose";

const participantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "participants.userType",
    },
    userType: {
      type: String,
      required: true,
      enum: ["Student", "Admin"],
    },
  },
  { _id: false },
);

const callSessionSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length === 2,
    },
    status: {
      type: String,
      enum: ["INITIATED", "RINGING", "ACCEPTED", "ENDED", "REJECTED"],
      default: "INITIATED",
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

callSessionSchema.index({ createdAt: -1 });

export const CallSession = mongoose.model("CallSession", callSessionSchema);
