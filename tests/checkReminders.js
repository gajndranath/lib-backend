import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const AdminReminder = mongoose.model("AdminReminder", new mongoose.Schema({}, { strict: false }));
    const count = await AdminReminder.countDocuments();
    const all = await AdminReminder.find().limit(5).lean();
    
    console.log(`Total AdminReminder records: ${count}`);
    console.log("Recent records:", JSON.stringify(all, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
