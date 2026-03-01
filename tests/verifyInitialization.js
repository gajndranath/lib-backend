import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import AdminReminderService from "../src/services/adminReminder.service.js";
import { Admin } from "../src/models/admin.model.js";

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Get a real admin ID or use a dummy one if seeding worked
    const admin = await Admin.findOne();
    if (!admin) {
      console.error("No admin found in database. Please run seed script first.");
      process.exit(1);
    }

    console.log(`\nTesting getAdminReminders for admin: ${admin.email}...`);
    
    // First call should trigger initialization
    const reminders = await AdminReminderService.getAdminReminders(admin._id);
    
    console.log(`Found ${reminders.length} reminders.`);
    reminders.forEach(r => {
      console.log(`- [${r.type}] ${r.title} (Status: ${r.isPaused ? 'PAUSED' : 'ACTIVE'})`);
    });

    if (reminders.length >= 2) {
      console.log("\nSUCCESS: Default reminders initialized and fetched.");
    } else {
      console.error("\nFAIL: Reminders not initialized as expected.");
    }

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
