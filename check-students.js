import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import mongoose from "mongoose";
import { Student } from "./src/models/student.model.js";

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    const students = await Student.find({ isDeleted: false })
      .select("name email libraryId emailVerified")
      .limit(10);

    console.log(`📊 Total students found: ${students.length}\n`);

    if (students.length > 0) {
      console.log("📋 Student List:");
      students.forEach((s, i) => {
        console.log(
          `${i + 1}. ${s.name} - ${s.email} (${s.libraryId}) - Verified: ${s.emailVerified}`,
        );
      });
    } else {
      console.log("⚠️  No students found in database!");
      console.log(
        "💡 Register a student first using POST /api/v1/student-auth/register",
      );
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
})();
