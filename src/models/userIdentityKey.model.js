import mongoose, { Schema } from "mongoose";

/**
 * User Identity Key Model
 * Stores user's LONG-TERM public key for chat encryption
 * Private key NEVER stored on server - kept secure on client
 *
 * Used for:
 * - End-to-end encryption across all conversations
 * - Identity verification
 * - Public key distribution to other users
 *
 * Similar to Signal/WhatsApp's user identity keypair
 */
const userIdentityKeySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "userType",
      index: true,
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
    // Optional: Track key rotation for future forward secrecy
    keyVersion: {
      type: Number,
      default: 1,
    },
    // When was this key created
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // When was this key last used
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Unique index: one identity key per user
userIdentityKeySchema.index({ userId: 1, userType: 1 }, { unique: true });

export const UserIdentityKey = mongoose.model(
  "UserIdentityKey",
  userIdentityKeySchema,
);
