import mongoose, { Schema } from "mongoose";
import { encryptText } from "../utils/crypto.js";

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
    atRest: {
      enabled: {
        type: Boolean,
        default: false,
      },
      iv: String,
      tag: String,
      alg: String,
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
      required: true,
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
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  { timestamps: true },
);

const wrapPayloadAtRest = (payload, secret) => {
  if (!payload?.ciphertext || !secret) return payload;
  if (payload.atRest?.enabled) return payload;

  const encrypted = encryptText(payload.ciphertext, secret);

  return {
    ...payload,
    ciphertext: encrypted.content,
    atRest: {
      enabled: true,
      iv: encrypted.iv,
      tag: encrypted.tag,
      alg: encrypted.alg,
    },
  };
};

chatMessageSchema.pre("save", function (next) {
  const secret =
    process.env.MESSAGE_AT_REST_SECRET || process.env.ACCESS_TOKEN_SECRET;

  if (!secret) return next();

  if (this.encryptedForRecipient) {
    this.encryptedForRecipient = wrapPayloadAtRest(
      this.encryptedForRecipient,
      secret,
    );
  }

  if (this.encryptedForSender) {
    this.encryptedForSender = wrapPayloadAtRest(
      this.encryptedForSender,
      secret,
    );
  }

  if (Array.isArray(this.editHistory) && this.editHistory.length > 0) {
    this.editHistory = this.editHistory.map((entry) => ({
      ...entry,
      encryptedForRecipient: wrapPayloadAtRest(
        entry.encryptedForRecipient,
        secret,
      ),
      encryptedForSender: wrapPayloadAtRest(entry.encryptedForSender, secret),
    }));
  }

  next();
});

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ recipientId: 1, status: 1 });

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
