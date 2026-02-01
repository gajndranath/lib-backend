export const DB_NAME = "library";

export const UserRoles = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STAFF: "STAFF",
};

export const StudentStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
};

export const FeeStatus = {
  PAID: "PAID",
  DUE: "DUE",
  PENDING: "PENDING",
};

export const ReminderType = {
  MONTHLY: "MONTHLY",
  DUE: "DUE",
  ADVANCE_EXPIRY: "ADVANCE_EXPIRY",
};

export const NotificationType = {
  PAYMENT_REMINDER: "PAYMENT_REMINDER",
  PAYMENT_CONFIRMATION: "PAYMENT_CONFIRMATION",
  OVERDUE_ALERT: "OVERDUE_ALERT",
  STUDENT_REGISTRATION: "STUDENT_REGISTRATION",
  SLOT_CHANGE: "SLOT_CHANGE",
  FEE_OVERRIDE: "FEE_OVERRIDE",
  SYSTEM_ALERT: "SYSTEM_ALERT",
  TEST: "TEST",
};

export const NotificationChannel = {
  EMAIL: "EMAIL",
  SMS: "SMS",
  FCM: "FCM",
  WEB_PUSH: "WEB_PUSH",
  IN_APP: "IN_APP",
};

export const PaymentMethod = {
  CASH: "CASH",
  ONLINE: "ONLINE",
  CHEQUE: "CHEQUE",
  OTHER: "OTHER",
};

export const AchievementCategory = {
  ACADEMIC: "ACADEMIC",
  SPORTS: "SPORTS",
  CULTURAL: "CULTURAL",
  OTHER: "OTHER",
};

// Grace period for payments (days after month end)
export const PAYMENT_GRACE_PERIOD = process.env.PAYMENT_GRACE_PERIOD || 2;

// Default reminder time (9 AM)
export const DEFAULT_REMINDER_HOUR = process.env.DEFAULT_REMINDER_HOUR || 9;
export const DEFAULT_REMINDER_MINUTE = process.env.DEFAULT_REMINDER_MINUTE || 0;

// Notification priorities
export const NotificationPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
};
