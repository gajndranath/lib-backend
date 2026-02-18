import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const checkAdmin = async () => {
  await connectDB();
  
  const { Admin } = await import("../models/admin.model.js");
  
  const admins = await Admin.find({});
  console.log(`Found ${admins.length} admins.`);
  
  // Lazy import Redis client to avoid top-level await issues if config differs
  const { getRedisClient } = await import("../config/redis.js");
  const redis = getRedisClient();

  for (const admin of admins) {
    console.log(`Admin ID: ${admin._id} | Email: ${admin.email} | Role: ${admin.role} | Active: ${admin.isActive}`);
    
    // Always force active and clear cache to be safe
    if (!admin.isActive) {
        console.log(`⚠️ Activating Admin ${admin.email}...`);
        admin.isActive = true;
        await admin.save();
        console.log("✅ Admin activated in DB.");
    }
    
    // Clear Redis cache
    if (redis) {
        const cacheKey = `admin:profile:${admin._id}`;
        await redis.del(cacheKey);
        console.log(`🗑️ Cleared Redis cache for ${cacheKey}`);
    }
  }

  process.exit();
};

checkAdmin();
