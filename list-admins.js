import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const listAdmins = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        const admins = await mongoose.connection.db.collection("admins").find({}).toArray();
        console.log("Admins Count:", admins.length);
        if (admins.length > 0) {
            console.log("Sample Admin:", {
                id: admins[0]._id,
                username: admins[0].username,
                email: admins[0].email,
                isDeleted: admins[0].isDeleted
            });
        }

        process.exit(0);
    } catch (err) {
        console.error("Diagnostic Failed:", err);
        process.exit(1);
    }
};

listAdmins();
