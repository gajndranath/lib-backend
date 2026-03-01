import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import ReminderService from "../src/services/reminder.service.js";
import NotificationService from "../src/services/notification.service.js";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Test ReminderService.processTodayReminders
  console.log("\n--- ReminderService.processTodayReminders ---");
  const reminderResult = await ReminderService.processTodayReminders();
  console.log("Reminder Result:", reminderResult);

  // Test NotificationService.broadcastToAdmins
  console.log("\n--- NotificationService.broadcastToAdmins ---");
  const notificationResult = await NotificationService.broadcastToAdmins(
    "Test Notification",
    "This is a test notification sent to all admins.",
    "SYSTEM",
  );
  console.log("Notification Result:", notificationResult);

  await mongoose.disconnect();
})();
