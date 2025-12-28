import cron from "node-cron";
import { Ledger } from "../models/ledger.model.js";
import { Student } from "../models/student.model.js";
import { Admin } from "../models/admin.model.js";
import NotificationService from "../services/notification.service.js";

// Daily reminder at 9 AM
cron.schedule("0 9 * * *", async () => {
  console.log("📅 Daily Reminder Job Started:", new Date().toISOString());

  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Find overdue records (unpaid from previous months)
    const overdueRecords = await Ledger.aggregate([
      {
        $match: {
          paymentStatus: "UNPAID",
          $or: [
            { billingYear: { $lt: currentYear } },
            {
              $and: [
                { billingYear: currentYear },
                { billingMonth: { $lt: currentMonth } },
              ],
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
          "student.reminderPaused": false,
          "student.isDeleted": false,
        },
      },
    ]);

    // Get all admins with notification preferences
    const admins = await Admin.find({
      "notificationPreferences.push": true,
    });

    // Send individual overdue notifications
    for (const record of overdueRecords) {
      const student = record.student;
      const title = "⏰ Overdue Payment Reminder";
      const message = `${student.name} has overdue payment of ₹${
        record.dueAmount
      } from ${record.billingMonth + 1}/${record.billingYear}`;

      for (const admin of admins) {
        if (admin.webPushSubscription) {
          try {
            await NotificationService.sendWebPush(admin.webPushSubscription, {
              title,
              body: message,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/badge-72x72.png",
              data: {
                studentId: student._id.toString(),
                type: "overdue_payment",
                url: `/student/${student._id}`,
                ledgerId: record._id.toString(),
              },
              actions: [
                {
                  action: "view",
                  title: "View Student",
                },
                {
                  action: "mark_paid",
                  title: "Mark as Paid",
                },
              ],
              vibrate: [200, 100, 200],
              requireInteraction: true,
              tag: `overdue_${student._id}`,
            });
          } catch (error) {
            if (error.statusCode === 410) {
              console.log(
                `Removing expired subscription for admin ${admin._id}`
              );
              admin.webPushSubscription = null;
              await admin.save();
            }
          }
        }

        // Send Email
        if (admin.notificationPreferences.email && admin.email) {
          await NotificationService.sendEmail(admin.email, title, message);
        }
      }
    }

    // Send daily summary
    const pendingThisMonth = await Ledger.countDocuments({
      billingMonth: currentMonth,
      billingYear: currentYear,
      paymentStatus: "UNPAID",
    });

    const totalOverdue = overdueRecords.length;

    if (totalOverdue > 0 || pendingThisMonth > 0) {
      const summaryTitle = "📊 Daily Payment Summary";
      const summaryMessage = `Today: ${pendingThisMonth} pending this month | ${totalOverdue} overdue students`;

      for (const admin of admins) {
        if (admin.webPushSubscription) {
          await NotificationService.sendWebPush(admin.webPushSubscription, {
            title: summaryTitle,
            body: summaryMessage,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/badge-72x72.png",
            data: {
              type: "daily_summary",
              url: "/dashboard",
              pendingCount: pendingThisMonth,
              overdueCount: totalOverdue,
            },
            tag: "daily_summary",
          });
        }
      }
    }

    console.log(
      `✅ Daily reminders sent. Overdue: ${totalOverdue}, Pending: ${pendingThisMonth}`
    );
  } catch (error) {
    console.error("❌ Error in daily reminder job:", error);
  }
});

// Monthly billing generation on 1st of every month
cron.schedule("0 0 1 * *", async () => {
  console.log("📋 Monthly Billing Generation Started");

  try {
    const LedgerService = (await import("../services/ledger.service.js"))
      .default;
    await LedgerService.generateMonthlyInvoices();
    console.log("✅ Monthly billing generated successfully");
  } catch (error) {
    console.error("❌ Error in monthly billing job:", error);
  }
});

// Hourly sync check
cron.schedule("0 * * * *", async () => {
  console.log("🔄 Hourly sync check");

  try {
    const io = require("socket.io").io;
    if (io) {
      const connectedAdmins = io.sockets.adapter.rooms.get("admins")?.size || 0;
      console.log(`Connected admins: ${connectedAdmins}`);
    }
  } catch (error) {
    console.error("Hourly sync error:", error);
  }
});
