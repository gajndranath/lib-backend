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

const chatConversationSchema = new Schema(
  {
    conversationType: {
      type: String,
      enum: ["DIRECT"],
      default: "DIRECT",
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length === 2,
    },
    participantsHash: {
      type: String,
      required: true,
    },
    lastMessageAt: {
      type: Date,
    },
    lastMessagePreview: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

chatConversationSchema.index({ participantsHash: 1 }, { unique: true });
chatConversationSchema.index({ lastMessageAt: -1 });

export const ChatConversation = mongoose.model(
  "ChatConversation",
  chatConversationSchema,
);
