import mongoose from "mongoose";
import { Library } from "./src/models/library.model.js";
import { Admin } from "./src/models/admin.model.js";
import dotenv from "dotenv";

dotenv.config();

const checkDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const library = await Library.findOne({ isActive: true });
        if (!library) {
            console.log("❌ No active library found");
        } else {
            console.log("✅ Found Library:", {
                id: library._id,
                name: library.name,
                ownerAdminId: library.ownerAdminId
            });

            if (library.ownerAdminId) {
                const admin = await Admin.findById(library.ownerAdminId);
                console.log("✅ Found Admin:", admin ? {
                    id: admin._id,
                    username: admin.username,
                    email: admin.email
                } : "NOT FOUND IN DB");
            } else {
                console.log("❌ Library has NO ownerAdminId set!");
            }
        }

        process.exit(0);
    } catch (err) {
        console.error("DB Check Failed:", err);
        process.exit(1);
    }
};

checkDB();
