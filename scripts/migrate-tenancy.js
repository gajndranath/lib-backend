/**
 * Migration Script: Add tenantId to all existing documents
 *
 * Run ONCE on your existing database to backfill all records to a default tenant.
 * After running, all existing data will be associated with the "Default Library" tenant.
 *
 * Usage:
 *   node scripts/migrate-tenancy.js
 *
 * Prerequisites:
 *   - MONGODB_URI env var set (or .env file present)
 *   - Run from the backend directory: cd backend && node scripts/migrate-tenancy.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import { Library } from "../src/models/library.model.js";
import { Admin } from "../src/models/admin.model.js";
import { Student } from "../src/models/student.model.js";
import { Slot } from "../src/models/slot.model.js";
import { StudentMonthlyFee } from "../src/models/studentMonthlyFee.model.js";
import { AdvanceBalance } from "../src/models/advanceBalance.model.js";
import { DueRecord } from "../src/models/dueRecord.model.js";
import { Announcement } from "../src/models/announcement.model.js";
import { AdminActionLog } from "../src/models/adminActionLog.model.js";
import { AdminReminder } from "../src/models/adminReminder.model.js";
import { ChatConversation } from "../src/models/chatConversation.model.js";
import { ChatMessage } from "../src/models/chatMessage.model.js";
import Notification from "../src/models/notification.model.js";
import { SlotChangeHistory } from "../src/models/slotChangeHistory.model.js";
import { Reminder } from "../src/models/reminder.model.js";

const MONGODB_URI =
  process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI environment variable is not set.");
  process.exit(1);
}

async function migrate() {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected.");

  // ─── Step 1: Create or find the default Library tenant ───────────────────
  let defaultLibrary = await Library.findOne({ slug: "default" });

  if (!defaultLibrary) {
    console.log("📚 Creating default Library tenant...");
    defaultLibrary = await Library.create({
      name: "Default Library",
      slug: "default",
      plan: "PRO",
      isActive: true,
      settings: {
        maxStudents: 10000,
        maxAdmins: 50,
        timezone: "Asia/Kolkata",
        currency: "INR",
      },
    });
    console.log(`✅ Default Library created: ${defaultLibrary._id}`);
  } else {
    console.log(`ℹ️  Default Library already exists: ${defaultLibrary._id}`);
  }

  const tenantId = defaultLibrary._id;

  // ─── Step 2: Backfill all models ─────────────────────────────────────────
  const models = [
    { name: "Admin", model: Admin },
    { name: "Student", model: Student },
    { name: "Slot", model: Slot },
    { name: "StudentMonthlyFee", model: StudentMonthlyFee },
    { name: "AdvanceBalance", model: AdvanceBalance },
    { name: "DueRecord", model: DueRecord },
    { name: "Announcement", model: Announcement },
    { name: "AdminActionLog", model: AdminActionLog },
    { name: "AdminReminder", model: AdminReminder },
    { name: "ChatConversation", model: ChatConversation },
    { name: "ChatMessage", model: ChatMessage },
    { name: "Notification", model: Notification },
    { name: "SlotChangeHistory", model: SlotChangeHistory },
    { name: "Reminder", model: Reminder },
  ];

  for (const { name, model } of models) {
    const result = await model.updateMany(
      { tenantId: { $exists: false } }, // Only update docs without tenantId
      { $set: { tenantId } },
    );
    console.log(
      `  ✅ ${name}: ${result.modifiedCount} documents updated (${result.matchedCount} matched)`,
    );
  }

  // ─── Step 3: Set ownerAdminId on the default library ─────────────────────
  const firstSuperAdmin = await Admin.findOne({ role: "SUPER_ADMIN" }).lean();
  if (firstSuperAdmin && !defaultLibrary.ownerAdminId) {
    await Library.findByIdAndUpdate(defaultLibrary._id, {
      ownerAdminId: firstSuperAdmin._id,
    });
    console.log(
      `✅ Set ownerAdminId on default library: ${firstSuperAdmin._id}`,
    );
  }

  console.log("\n🎉 Tenancy migration complete!");
  console.log(`   Default tenant ID: ${tenantId}`);
  console.log(
    "   All existing records have been assigned to the default library.",
  );
  console.log(
    "\n⚠️  NEXT STEPS:",
  );
  console.log(
    "   1. Update your .env with TENANT_DEFAULT_ID=" + tenantId,
  );
  console.log(
    "   2. Restart the server — all new records will require tenantId.",
  );

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
