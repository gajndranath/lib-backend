import mongoose, { Schema } from "mongoose";

const userKeyBackupSchema = new Schema(
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
      index: true,
    },
    publicKey: {
      type: String,
      required: true,
      trim: true,
    },
    encryptedPrivateKey: {
      type: String,
      required: true,
      trim: true,
    },
    keyBackupSalt: {
      type: String,
      required: true,
      trim: true,
    },
    keyBackupIv: {
      type: String,
      required: true,
      trim: true,
    },
    keyBackupVersion: {
      type: Number,
      required: true,
    },
    rotatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

userKeyBackupSchema.index({ userId: 1, userType: 1, keyBackupVersion: 1 });

export const UserKeyBackup = mongoose.model(
  "UserKeyBackup",
  userKeyBackupSchema,
);
