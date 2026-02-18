import mongoose, { Schema } from "mongoose";

const adminReminderSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["DUE_STUDENTS", "END_OF_MONTH_DUE", "PAYMENT_PENDING", "CUSTOM"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      trim: true,
    },
    // Reference to students marked as due
    affectedStudents: [
      {
        type: Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    dueRecords: [
      {
        type: Schema.Types.ObjectId,
        ref: "DueRecord",
      },
    ],
    // Reminder schedule
    schedule: {
      type: {
        type: String,
        enum: ["ONCE", "DAILY", "WEEKLY", "MONTHLY"],
        default: "ONCE",
      },
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
      },
      // For recurring reminders
      nextTriggerDate: {
        type: Date,
      },
      lastTriggeredAt: {
        type: Date,
      },
    },
    // Delivery settings
    deliverVia: [
      {
        type: String,
        enum: ["EMAIL", "PUSH", "SMS", "IN_APP"],
      },
    ],
    // Control flags
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    pausedAt: {
      type: Date,
    },
    pauseReason: {
      type: String,
      trim: true,
    },
    // Notification history
    notificationHistory: [
      {
        sentAt: Date,
        channel: {
          type: String,
          enum: ["EMAIL", "PUSH", "SMS", "IN_APP"],
        },
        status: {
          type: String,
          enum: ["SENT", "FAILED", "PENDING"],
        },
        errorMessage: String,
      },
    ],
    // Month/Year context
    month: {
      type: Number, // 0-11
    },
    year: {
      type: Number,
    },
    // Metadata
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for frequent queries
adminReminderSchema.index({ adminId: 1, isActive: 1, isPaused: 1 });
adminReminderSchema.index({ tenantId: 1, type: 1, isActive: 1 });
adminReminderSchema.index({ type: 1, isActive: 1 });
adminReminderSchema.index({ "schedule.nextTriggerDate": 1, isActive: 1 });
adminReminderSchema.index({ month: 1, year: 1, isActive: 1 });

export const AdminReminder = mongoose.model(
  "AdminReminder",
  adminReminderSchema,
);
