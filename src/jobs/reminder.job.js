import cron from "node-cron";
import mongoose from "mongoose";
import ReminderService from "../services/reminder.service.js";
import FeeService from "../services/fee.service.js";
import NotificationService from "../services/notification.service.js";

// 1. Monthly fee generation - 1st of every month at 00:01
cron.schedule("1 0 1 * *", async () => {
  console.log("📋 Monthly fee generation job started");

  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const result = await FeeService.generateMonthlyFees(
      currentMonth,
      currentYear,
      null,
    );

    console.log(
      `✅ Monthly fees generated: ${result.generated} created, ${result.skipped} skipped`,
    );

    const reminders = await ReminderService.generateMonthlyReminders();
    console.log(`✅ Monthly reminders generated: ${reminders.length}`);
  } catch (error) {
    console.error("❌ Error in monthly fee generation:", error);

    await NotificationService.sendSystemAlert(
      "Monthly Fee Generation Failed",
      `Error: ${error.message}`,
      "CRITICAL",
    );
  }
});

// 2. Daily reminder processing - Every day at 09:00
cron.schedule("0 9 * * *", async () => {
  console.log("🔔 Daily reminder processing job started");

  try {
    const result = await ReminderService.processTodayReminders();

    console.log(
      `✅ Daily reminders processed: ${result.sent} sent, ${result.failed} failed`,
    );

    const dueReminders = await ReminderService.generateDueReminders();
    console.log(`✅ Due reminders generated: ${dueReminders.length}`);
  } catch (error) {
    console.error("❌ Error in daily reminder processing:", error);
  }
});

// 3. Check for overdue payments - Every day at 10:00
cron.schedule("0 10 * * *", async () => {
  console.log("⏰ Overdue payment check job started");

  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const pendingFees = await mongoose.model("StudentMonthlyFee").aggregate([
      {
        $match: {
          status: "PENDING",
          $or: [
            { year: { $lt: currentYear } },
            {
              $and: [{ year: currentYear }, { month: { $lt: currentMonth } }],
            },
          ],
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $match: {
          "student.status": "ACTIVE",
          "student.isDeleted": false,
        },
      },
    ]);

    for (const fee of pendingFees) {
      const feeDate = new Date(fee.year, fee.month + 1, 0);
      const gracePeriodEnd = new Date(feeDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 2);

      if (today > gracePeriodEnd) {
        await FeeService.markAsDue(
          fee.studentId,
          fee.month,
          fee.year,
          today,
          null,
        );

        console.log(
          `Auto-marked as due: ${fee.student.name} - ${fee.month + 1}/${
            fee.year
          }`,
        );
      }
    }

    console.log(
      `✅ Overdue check completed. Processed: ${pendingFees.length} pending fees`,
    );
  } catch (error) {
    console.error("❌ Error in overdue payment check:", error);
  }
});

// 4. Advance application check - Every day at 11:00
cron.schedule("0 11 * * *", async () => {
  console.log("💰 Advance application check job started");

  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const pendingFees = await mongoose.model("StudentMonthlyFee").find({
      month: currentMonth,
      year: currentYear,
      status: "PENDING",
      coveredByAdvance: false,
    });

    let appliedCount = 0;

    for (const fee of pendingFees) {
      try {
        await FeeService.applyAdvanceToMonth(
          fee.studentId,
          fee.month,
          fee.year,
          null,
        );

        appliedCount++;
      } catch (error) {
        continue;
      }
    }

    console.log(`✅ Advance applied to ${appliedCount} fees`);
  } catch (error) {
    console.error("❌ Error in advance application check:", error);
  }
});

// 5. End-of-month due students reminder - Last 3 days of month at 09:00
cron.schedule("0 9 * * *", async () => {
  console.log("📬 End-of-month due students reminder job started");

  try {
    const AdminReminderService = (
      await import("../services/adminReminder.service.js")
    ).default;

    await AdminReminderService.processEndOfMonthDueReminders();

    console.log("✅ End-of-month due reminders processed");
  } catch (error) {
    console.error("❌ Error in end-of-month reminder processing:", error);
  }
});

// 6. System health check - Every hour
cron.schedule("0 * * * *", async () => {
  console.log("🩺 System health check job started");

  try {
    // Check database connection status
    const isConnected = mongoose.connection.readyState === 1;
    const connectionStatus = isConnected ? "CONNECTED" : "DISCONNECTED";

    // Get basic database stats if connected
    let dbInfo = {};
    if (isConnected) {
      try {
        const dbStats = await mongoose.connection.db.stats();
        dbInfo = {
          status: connectionStatus,
          collections: dbStats.collections || "N/A",
        };
      } catch (err) {
        dbInfo = { status: connectionStatus };
      }
    } else {
      dbInfo = { status: connectionStatus };
    }

    console.log(`✅ System health check completed - DB: ${dbInfo.status}`);
  } catch (error) {
    console.error("❌ Error in system health check:", error.message);
  }
});

console.log("✅ All cron jobs scheduled and active");
