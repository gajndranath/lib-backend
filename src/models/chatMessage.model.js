import mongoose, { Schema } from "mongoose";

const encryptedPayloadSchema = new Schema(
  {
    algorithm: {
      type: String,
      enum: ["sealed_box"],
      default: "sealed_box",
    },
    ciphertext: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const chatMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "senderType",
      index: true,
    },
    senderType: {
      type: String,
      required: true,
      enum: ["Student", "Admin"],
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "recipientType",
      index: true,
    },
    recipientType: {
      type: String,
      required: true,
      enum: ["Student", "Admin"],
    },
    contentType: {
      type: String,
      enum: ["TEXT", "CALL"],
      default: "TEXT",
    },
    encryptedForRecipient: {
      type: encryptedPayloadSchema,
      required: true,
    },
    encryptedForSender: {
      type: encryptedPayloadSchema,
      required: true,
    },
    senderPublicKey: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "READ"],
      default: "SENT",
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    // Message features (for future use)
    replyTo: {
      messageId: {
        type: Schema.Types.ObjectId,
        ref: "ChatMessage",
      },
      senderName: String,
      decryptedText: String,
    },
    editedAt: Date,
    editHistory: [
      {
        editedAt: Date,
        encryptedForRecipient: encryptedPayloadSchema,
        encryptedForSender: encryptedPayloadSchema,
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    forwardedFrom: {
      messageId: {
        type: Schema.Types.ObjectId,
        ref: "ChatMessage",
      },
      senderName: String,
    },
    // For offline queue support
    isQueued: {
      type: Boolean,
      default: false,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ recipientId: 1, status: 1 });

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
