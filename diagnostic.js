import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const run = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/library`);
        console.log("Connected to DB");
        
        const Student = mongoose.model("Student", new mongoose.Schema({}, { strict: false }), "students");
        
        const archivedCount = await Student.countDocuments({ status: "ARCHIVED" });
        console.log("Students with status: 'ARCHIVED':", archivedCount);
        
        const deletedCount = await Student.countDocuments({ isDeleted: true });
        console.log("Students with isDeleted: true:", deletedCount);
        
        const bothCount = await Student.countDocuments({ status: "ARCHIVED", isDeleted: true });
        console.log("Students with both ARCHIVED and isDeleted: true:", bothCount);
        
        if (archivedCount > 0) {
            const one = await Student.findOne({ status: "ARCHIVED" }).lean();
            console.log("Sample Archived Student:", JSON.stringify(one, null, 2));
        }

        const allStatus = await Student.distinct("status");
        console.log("Found statuses in DB:", allStatus);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
