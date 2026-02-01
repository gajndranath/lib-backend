import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: "userType",
    },
    userType: {
      type: String,
      required: true,
      enum: ["Student", "Admin"],
      default: "Student",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "PAYMENT_REMINDER",
        "PAYMENT_CONFIRMATION",
        "OVERDUE_ALERT",
        "STUDENT_REGISTRATION",
        "SLOT_CHANGE",
        "FEE_OVERRIDE",
        "SYSTEM_ALERT",
        "TEST",
      ],
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    channels: [
      {
        channel: {
          type: String,
          enum: ["EMAIL", "SMS", "FCM", "WEB_PUSH", "IN_APP"],
        },
        sentAt: Date,
        status: {
          type: String,
          enum: ["SENT", "DELIVERED", "FAILED", "PENDING"],
        },
        error: String,
      },
    ],
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 2592000 }, // Auto-delete after 30 days
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Method to mark as read
notificationSchema.methods.markAsRead = function () {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark as delivered
notificationSchema.methods.markAsDelivered = function (
  channel,
  status = "DELIVERED",
  error = null
) {
  this.channels.push({
    channel,
    sentAt: new Date(),
    status,
    error,
  });

  if (status === "DELIVERED" && !this.delivered) {
    this.delivered = true;
    this.deliveredAt = new Date();
  }

  return this.save();
};

// Static method to get unread notifications count
notificationSchema.statics.getUnreadCount = async function (userId) {
  return await this.countDocuments({
    userId,
    read: false,
  });
};

// Static method to get notifications for user
notificationSchema.statics.getUserNotifications = async function (
  userId,
  limit = 50,
  skip = 0
) {
  return await this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
