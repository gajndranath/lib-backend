import mongoose, { Schema } from "mongoose";

const announcementSchema = new Schema(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    targetScope: {
      type: String,
      enum: ["ALL_STUDENTS", "SLOT", "SPECIFIC_STUDENTS"],
      required: true,
    },
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
    },
    recipientIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    recipientCiphertexts: [
      {
        recipientId: String,
        algorithm: String,
        titleCiphertext: String,
        bodyCiphertext: String,
      },
    ],
  },
  { timestamps: true },
);

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ targetScope: 1 });
announcementSchema.index({ slotId: 1 });
announcementSchema.index({ recipientIds: 1 });

export const Announcement = mongoose.model("Announcement", announcementSchema);
