import mongoose, { Schema } from "mongoose";
import { getFeeDueDate } from "../utils/feeHelpers.js";

// Escalation thresholds – days after the fee due date
export const ESCALATION_LEVELS = {
  0: { label: "new",      days: 0,  nextInDays: 1  },
  1: { label: "mild",     days: 1,  nextInDays: 2  }, // remind on day 3
  2: { label: "medium",   days: 3,  nextInDays: 4  }, // remind on day 7
  3: { label: "high",     days: 7,  nextInDays: 8  }, // remind on day 15
  4: { label: "urgent",   days: 15, nextInDays: 15 }, // remind on day 30
  5: { label: "critical", days: 30, nextInDays: 30 }, // super-admin escalation
};

const dueRecordSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    monthsDue: [
      {
        type: String, // Format: "YYYY-MM"
        required: true,
        index: true,
      },
    ],
    totalDueAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // The date from which overdue counting starts (earliest month's fee due date)
    dueSince: {
      type: Date,
      default: null,
    },
    reminderDate: {
      type: Date,
      required: true,
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolutionDate: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
    },

    // ─── Escalation Tracking ─────────────────────────────────────────
    /** Total number of reminder notifications sent so far */
    reminderCount: { type: Number, default: 0 },
    /** Timestamp of the last reminder delivery */
    lastReminderSentAt: { type: Date, default: null },
    /** When should the NEXT escalation reminder fire (set by cron) */
    nextReminderDue: { type: Date, default: null, index: true },
    /**
     * 0 = new/green      (<1 day)
     * 1 = mild/green     (1–3 days)
     * 2 = medium/yellow  (3–7 days)
     * 3 = high/orange    (7–15 days)
     * 4 = urgent/red     (15–30 days)
     * 5 = critical/dark  (30+ days → super-admin)
     */
    escalationLevel: { type: Number, default: 0, min: 0, max: 5, index: true },

    // Audit
    createdBy:  { type: Schema.Types.ObjectId, ref: "Admin" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    tenantId:   { type: Schema.Types.ObjectId, ref: "Library", index: true },
  },
  { timestamps: true }
);

// Compound indexes for efficient cron queries
dueRecordSchema.index({ reminderDate: 1, resolved: 1 });
dueRecordSchema.index({ nextReminderDue: 1, resolved: 1 });
dueRecordSchema.index({ escalationLevel: -1, resolved: 1 });

/**
 * Virtual: compute live daysOverdue from dueSince (or reminderDate).
 * Always fresh — never stale.
 */
dueRecordSchema.virtual("daysOverdue").get(function () {
  if (this.resolved) return 0;
  const anchor = this.dueSince || this.reminderDate;
  if (!anchor) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anchorDay = new Date(anchor);
  anchorDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - anchorDay) / (1000 * 60 * 60 * 24)));
});

/**
 * Compute & persist the correct escalation level from current daysOverdue.
 * Call this whenever monthsDue changes or after recording a reminder.
 */
dueRecordSchema.methods.updateEscalationLevel = function () {
  const d = this.daysOverdue;
  if      (d >= 30) this.escalationLevel = 5;
  else if (d >= 15) this.escalationLevel = 4;
  else if (d >= 7)  this.escalationLevel = 3;
  else if (d >= 3)  this.escalationLevel = 2;
  else if (d >= 1)  this.escalationLevel = 1;
  else              this.escalationLevel = 0;
};

/**
 * Record that a reminder was just sent.
 * Increments counter, updates level, and schedules the next fire time.
 */
dueRecordSchema.methods.recordReminderSent = function () {
  this.reminderCount += 1;
  this.lastReminderSentAt = new Date();
  this.updateEscalationLevel();

  const config = ESCALATION_LEVELS[this.escalationLevel] ?? ESCALATION_LEVELS[5];
  const next = new Date();
  next.setDate(next.getDate() + config.nextInDays);
  next.setHours(9, 0, 0, 0); // fire at 9 AM
  this.nextReminderDue = next;
};

/** Resolve the due record (full payment received). */
dueRecordSchema.methods.resolve = function (adminId, remarks) {
  this.resolved = true;
  this.resolutionDate = new Date();
  this.resolvedBy = adminId;
  this.escalationLevel = 0;
  this.nextReminderDue = null;
  this.remarks = remarks
    ? `${this.remarks || ""}\nResolved on ${new Date().toISOString()}: ${remarks}`
    : `Resolved on ${new Date().toISOString()}`;
  return this.save();
};

export const DueRecord = mongoose.model("DueRecord", dueRecordSchema);
