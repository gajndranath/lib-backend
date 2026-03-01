import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import AdminReminderService from "../src/services/adminReminder.service.js";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Test daily overdue escalation
  console.log("\n--- AdminReminderService.processDailyOverdueEscalations ---");
  const escalationResult =
    await AdminReminderService.processDailyOverdueEscalations();
  console.log("Escalation Result:", escalationResult);

  // Test end-of-month due reminders
  console.log("\n--- AdminReminderService.processEndOfMonthDueReminders ---");
  const endOfMonthResult =
    await AdminReminderService.processEndOfMonthDueReminders();
  console.log("End of Month Result:", endOfMonthResult);

  await mongoose.disconnect();
})();
