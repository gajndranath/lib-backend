import mongoose from "mongoose";
import dotenv from "dotenv";
import { Library } from "../models/library.model.js";

dotenv.config();

const getTenantId = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const library = await Library.findOne({ slug: "default" });
    if (library) {
      console.log(`TENANT_ID=${library._id}`);
    } else {
      console.error("Default library not found");
    }
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

getTenantId();
