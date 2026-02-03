/**
 * Migration Script: Add Personalized Billing Fields to Existing Students
 *
 * This script updates all existing students with:
 * - billingDay (based on joiningDate)
 * - nextBillingDate (calculated from current date)
 *
 * Run this ONCE before deploying the personalized billing system
 */

import mongoose from "mongoose";
import { Student } from "../models/student.model.js";
import dotenv from "dotenv";

dotenv.config();

async function migrateStudentBillingFields() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error(
        "MongoDB URI not found. Set MONGO_URI or MONGODB_URI in your .env file.",
      );
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to database");

    // Find all students without billingDay
    const students = await Student.find({
      $or: [
        { billingDay: { $exists: false } },
        { billingDay: null },
        { nextBillingDate: { $exists: false } },
        { nextBillingDate: null },
      ],
    });

    console.log(`📋 Found ${students.length} students to migrate`);

    let updated = 0;
    let errors = 0;

    for (const student of students) {
      try {
        const joiningDate = student.joiningDate || new Date();

        // Set billing day from joining date
        student.billingDay = joiningDate.getDate();

        // Calculate next billing date
        const today = new Date();
        const nextBilling = new Date(today);

        // If we're past this month's billing day, set to next month
        if (today.getDate() >= student.billingDay) {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }

        // Handle months with fewer days
        const maxDayInMonth = new Date(
          nextBilling.getFullYear(),
          nextBilling.getMonth() + 1,
          0,
        ).getDate();

        if (student.billingDay > maxDayInMonth) {
          nextBilling.setDate(maxDayInMonth);
        } else {
          nextBilling.setDate(student.billingDay);
        }

        student.nextBillingDate = nextBilling;

        // Save without triggering all hooks
        await student.save({ validateBeforeSave: false });

        updated++;
        console.log(
          `✅ Updated ${student.name}: billingDay=${student.billingDay}, nextBilling=${nextBilling.toDateString()}`,
        );
      } catch (error) {
        errors++;
        console.error(`❌ Error updating ${student.name}:`, error.message);
      }
    }

    console.log("\n📊 Migration Complete:");
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  📋 Total: ${students.length}`);

    // Close connection
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
migrateStudentBillingFields()
  .then(() => {
    console.log("\n🎉 Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
