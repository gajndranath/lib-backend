import mongoose from "mongoose";
import { Library } from "./src/models/library.model.js";
import { Admin } from "./src/models/admin.model.js";
import dotenv from "dotenv";

dotenv.config();

const fixOwner = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const library = await Library.findOne({ isActive: true });
        if (!library) {
            console.log("❌ No active library found");
            process.exit(0);
        }

        const admin = await Admin.findOne({ isActive: true }) || await Admin.findOne({});
        if (!admin) {
            console.log("❌ No Admin found in DB to link!");
            process.exit(0);
        }

        library.ownerAdminId = admin._id;
        await library.save();

        console.log(`✅ Linked Admin ${admin.username} (${admin._id}) as owner of Library: ${library.name}`);
        process.exit(0);
    } catch (err) {
        console.error("Fix Failed:", err);
        process.exit(1);
    }
};

fixOwner();
