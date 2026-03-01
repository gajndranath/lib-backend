import mongoose from "mongoose";
import dotenv from "dotenv";
import { Library } from "../models/library.model.js";

dotenv.config();

const seedDefaultLibrary = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const existing = await Library.findOne({ slug: "default" });
    if (existing) {
      console.log("✅ Default library already exists.");
      console.log(`TENANT_ID=${existing._id}`);
    } else {
      const library = await Library.create({
        name: "Default Library",
        slug: "default",
        address: "123 Main St",
        phone: "1234567890",
        email: "default@library.com",
        website: "https://library.com",
        logoUrl: "",
        settings: {
          gracePeriodDays: 5,
          lateFeePerDay: 10,
          maxStudents: 100,
          maxAdmins: 5,
          timezone: "Asia/Kolkata",
          currency: "INR",
        },
      });
      console.log("✅ Default library created!");
      console.log(`TENANT_ID=${library._id}`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedDefaultLibrary();
