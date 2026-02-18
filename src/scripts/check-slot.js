import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const checkSlot = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Lazy load model
    const { Slot } = await import("../models/slot.model.js");
    
    const slotId = "69955a1417a1e66ac3530cb8"; 
    const slot = await Slot.findById(slotId);
    
    if (slot) {
        console.log("✅ Slot FOUND using findById:", slot);
    } else {
        console.log("❌ Slot NOT FOUND using findById");
    }

    // Check raw count
    const count = await Slot.countDocuments();
    console.log(`Total Slots in DB: ${count}`);
    
    if (count > 0) {
        const all = await Slot.find({}).limit(1);
        console.log("Sample Slot:", all[0]);
    }

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

checkSlot();
