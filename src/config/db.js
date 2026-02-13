import mongoose from "mongoose";
import logger from "../utils/logger.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/library`,
      {
        maxPoolSize: 50,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        w: "majority",
        journal: true,
      },
    );
    logger.info(
      `MongoDB connected! DB HOST: ${connectionInstance.connection.host}`,
      {
        host: connectionInstance.connection.host,
        poolSize: "max=50, min=10",
      },
    );
  } catch (error) {
    logger.error("MongoDB connection failed", {
      error: error.message,
      uri: process.env.MONGODB_URI,
    });
    process.exit(1);
  }
};

export default connectDB;
