import cron from "node-cron";
import mongoose from "mongoose";
import ReminderService from "../services/reminder.service.js";
import FeeService from "../services/fee.service.js";
import NotificationService from "../services/notification.service.js";
import AdminReminderService from "../services/adminReminder.service.js";


// 1. Daily personalized fee generation - Every day at 00:01
cron.schedule("1 0 * * *", async () => {
  console.log("📋 Personalized fee generation job started");

  try {
    const result = await FeeService.generatePersonalizedFees(null);

    console.log(
      `✅ Personalized fees generated: ${result.generated} created, ${result.skipped} skipped`,
    );

    if (result.studentsProcessed.length > 0) {
      console.log("Students processed:");
      result.studentsProcessed.forEach((s) => {
        console.log(
          `  - ${s.name}: Billing date ${s.billingDate.toDateString()}, Next: ${s.nextBillingDate.toDateString()}`,
        );
      });
    }
  } catch (error) {
    console.error("❌ Error in personalized fee generation:", error);

    await NotificationService.sendSystemAlert(
      "Personalized Fee Generation Failed",
      `Error: ${error.message}`,
      "CRITICAL",
    );
  }
});

// 2. Legacy monthly fee generation (kept for backward compatibility) - 1st of every month at 00:30
cron.schedule("30 0 1 * *", async () => {
  console.log("📋 Legacy monthly fee generation job started");

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

// 2a. Check for students with overdue payments and notify admin - Every day at 09:30 and 10:00
cron.schedule("30 9,10 * * *", async () => {
  console.log("🔔 Overdue payment notification job started");

  try {
    const overdueStudents = await FeeService.getStudentsWithOverduePayments(0);

    if (overdueStudents.length > 0) {
      console.log(
        `⚠️  Found ${overdueStudents.length} students with overdue payments`,
      );

      // Send notification to admin about overdue students
      const adminMessage = `${overdueStudents.length} student(s) have overdue payments:\n\n${overdueStudents
        .map(
          (s) =>
            `- ${s.name} (Due: ₹${s.pendingFee.totalAmount}, ${s.daysPastDue} days overdue)`,
        )
        .join("\n")}`;

      await NotificationService.sendSystemAlert(
        "Overdue Payments Alert",
        adminMessage,
        "WARNING",
      );

      console.log("✅ Admin notification sent for overdue payments");
    } else {
      console.log("✅ No overdue payments found");
    }
  } catch (error) {
    console.error("❌ Error in overdue payment notification:", error);
  }
});

// 3. Auto-mark overdue payments as DUE - Every day at 10:30
cron.schedule("30 10 * * *", async () => {
  console.log("⏰ Auto-mark overdue payments job started");

  try {
    // Auto-mark fees as DUE after 1 day grace period
    const result = await FeeService.autoMarkOverdueAsDue(1, null);

    console.log(`✅ Auto-marked ${result.markedDue} pending fees as DUE`);

    if (result.errors.length > 0) {
      console.error(`❌ Errors: ${result.errors.length}`);
      result.errors.forEach((err) => {
        console.error(`  - ${err.student}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error("❌ Error in auto-mark overdue:", error);
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
    await AdminReminderService.processEndOfMonthDueReminders();
    console.log("✅ End-of-month due reminders processed");
  } catch (error) {
    console.error("❌ Error in end-of-month reminder processing:", error);
  }
});

// ─── NEW PHASE 1: Daily Overdue Escalation ───────────────────────────────────
// Runs daily at 09:05 (just after the daily reminder job at 09:00)
// Fires Day-1 / Day-3 / Day-7 / Day-15 / Day-30 escalation reminders
cron.schedule("5 9 * * *", async () => {
  console.log("📈 Daily overdue escalation job started");
  try {
    const result = await AdminReminderService.processDailyOverdueEscalations();
    console.log(
      `✅ Escalation done — processed: ${result.processed}, escalated: ${result.escalated.length}, errors: ${result.errors.length}`
    );
  } catch (error) {
    console.error("❌ Error in overdue escalation cron:", error);
    await NotificationService.sendSystemAlert(
      "Escalation Cron Failed",
      `Error: ${error.message}`,
      "CRITICAL"
    );
  }
});

// ─── NEW PHASE 2: Auto-mark PENDING → DUE on 6th of each month ──────────────
// Runs on the 6th at 07:00 AM (after the grace period of 5 days has passed)
cron.schedule("0 7 6 * *", async () => {
  console.log("⏰ Auto-mark overdue fees job started (6th of month)");
  try {
    const result = await AdminReminderService.autoMarkOverdueFees();
    console.log(`✅ Auto-marked ${result.marked} fees as DUE, errors: ${result.errors.length}`);
  } catch (error) {
    console.error("❌ Error in auto-mark overdue cron:", error);
    await NotificationService.sendSystemAlert(
      "Auto-Mark Due Cron Failed",
      `Error: ${error.message}`,
      "CRITICAL"
    );
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
