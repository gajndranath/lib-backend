import mongoose, { Schema } from "mongoose";

const conversationKeySchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "userType",
    },
    userType: {
      type: String,
      enum: ["Admin", "Student"],
      required: true,
    },
    publicKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index: one public key per user per conversation
conversationKeySchema.index(
  { conversationId: 1, userId: 1, userType: 1 },
  { unique: true },
);

// Index for quick lookup by conversation
conversationKeySchema.index({ conversationId: 1 });

export const ConversationKey = mongoose.model(
  "ConversationKey",
  conversationKeySchema,
);
