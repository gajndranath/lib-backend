import mongoose, { Schema } from "mongoose";

const reminderSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    triggerDate: {
      type: Date,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["MONTHLY", "DUE", "ADVANCE_EXPIRY"],
      required: true,
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentVia: [
      {
        channel: {
          type: String,
          enum: ["EMAIL", "PUSH", "SMS", "IN_APP"],
        },
        sentAt: Date,
        status: {
          type: String,
          enum: ["SENT", "FAILED", "PENDING"],
        },
      },
    ],

    // Content
    title: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
    },

    // Metadata
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for cron job queries
reminderSchema.index({ triggerDate: 1, resolved: false });
reminderSchema.index(
  { tenantId: 1, studentId: 1, month: 1, year: 1, type: 1 },
  { unique: true }
);

// Pre-save to set default title/message
reminderSchema.pre("save", function (next) {
  if (!this.title || !this.message) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    if (this.type === "MONTHLY") {
      this.title = `Monthly Fee Reminder - ${monthNames[this.month]} ${
        this.year
      }`;
      this.message = `Your monthly fee for ${monthNames[this.month]} ${
        this.year
      } is pending. Please pay at your earliest convenience.`;
    } else if (this.type === "DUE") {
      this.title = `Overdue Payment Alert`;
      this.message = `You have overdue payments for ${monthNames[this.month]} ${
        this.year
      }. Please clear your dues immediately.`;
    }
  }
  next();
});

// Method to mark as sent
reminderSchema.methods.markSent = function (channel) {
  this.sentVia.push({
    channel,
    sentAt: new Date(),
    status: "SENT",
  });
  this.attempts += 1;
  this.lastAttemptAt = new Date();

  return this.save();
};

export const Reminder = mongoose.model("Reminder", reminderSchema);
