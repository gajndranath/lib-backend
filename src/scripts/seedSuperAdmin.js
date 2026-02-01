// backend/scripts/seedSuperAdmin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const createFirstAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const Admin = mongoose.model("Admin", {
      username: String,
      email: String,
      password: String,
      role: { type: String, default: "SUPER_ADMIN" },
    });

    const existingAdmin = await Admin.findOne({
      email: "superadmin@library.com",
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await Admin.create({
        username: "superadmin",
        email: "superadmin@library.com",
        password: hashedPassword,
        role: "SUPER_ADMIN",
      });

      console.log("✅ First Super Admin created!");
      console.log("📧 Email: superadmin@library.com");
      console.log("🔑 Password: admin123");
    } else {
      console.log("⚠️  Super Admin already exists!");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

createFirstAdmin();
