import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import AdminReminderService from "../src/services/adminReminder.service.js";

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const today = new Date();
    const month = today.getMonth(); // Current month
    const year = today.getFullYear();

    console.log(`\nTesting getEndOfMonthDueSummary for ${month}/${year}...`);
    const summary = await AdminReminderService.getEndOfMonthDueSummary(month, year);
    
    console.log("Summary Result:");
    console.log(JSON.stringify(summary, (key, value) => {
        if (key === "students") return value.length + " students"; // Truncate students for readability
        return value;
    }, 2));

    if (summary.totalDueAmount === null) {
      console.error("FAIL: totalDueAmount is still null!");
    } else {
      console.log("SUCCESS: totalDueAmount is not null.");
    }

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
