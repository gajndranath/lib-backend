import mongoose from "mongoose";

/**
 * DATABASE OPTIMIZATION & CONNECTION POOLING
 * Improves connection handling and query performance
 */

export const optimizeMongooseConnection = () => {
  // Optimize connection pool settings
  const mongoUri = process.env.MONGODB_URI;

  const connectionOptions = {
    // Connection pooling - increased for 200 concurrent users
    maxPoolSize: 25, // Increased from default 10
    minPoolSize: 8,
    maxIdleTimeMS: 45000,

    // Query timeout
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,

    // Retry settings
    retryWrites: true,
    retryReads: true,
    maxStalenessSeconds: 120,

    // Connection settings
    family: 4,
  };

  return connectionOptions;
};

/**
 * QUERY OPTIMIZATION HELPERS
 * Provides methods to optimize common query patterns
 */
export class QueryOptimizer {
  /**
   * Lean queries - return plain JS objects instead of Mongoose documents
   * Faster when you don't need Mongoose functionality
   */
  static leanQuery(query) {
    return query.lean();
  }

  /**
   * Select only needed fields to reduce memory usage
   */
  static selectFields(query, fields) {
    return query.select(fields);
  }

  /**
   * Pagination helper
   */
  static paginate(query, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return query.skip(skip).limit(limit);
  }

  /**
   * Batch query optimization
   * Useful for fetching multiple documents at once
   */
  static async batchFetch(Model, ids, projection = null) {
    return Model.find({ _id: { $in: ids } })
      .select(projection)
      .lean()
      .exec();
  }

  /**
   * Aggregate helper for complex queries
   */
  static async aggregate(Model, pipeline) {
    return Model.aggregate(pipeline).allowDiskUse(true).exec();
  }
}

/**
 * Get student with lean option (read-only, faster)
 */
export const getStudentLean = async (filter, select = null) => {
  let query = StudentModel.find(filter).lean();
  if (select) {
    query = query.select(select);
  }
  return query;
};

/**
 * Count students with indexed fields
 */
export const countStudentsBySlot = async (slotId, status = "ACTIVE") => {
  return StudentModel.countDocuments({
    slotId,
    status,
    isDeleted: false,
  });
};

/**
 * Batch get multiple students efficiently
 */
export const getBatchStudents = async (studentIds) => {
  return StudentModel.find({
    _id: { $in: studentIds },
    isDeleted: false,
  })
    .lean()
    .select("_id name email phone slotId status monthlyFee");
};

/**
 * Get paginated results with lean
 */
export const getPaginatedStudents = async (filter, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    StudentModel.find(filter)
      .lean()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    StudentModel.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * INDEX RECOMMENDATIONS for better performance
 * These should be created during initial setup
 */
export const requiredIndexes = [
  // Chat Message indexes
  {
    collection: "chatmessages",
    indexes: [
      { conversationId: 1, createdAt: -1 }, // Most common query
      { recipientId: 1, status: 1 }, // For delivery tracking
      { senderId: 1, createdAt: -1 }, // User message history
    ],
  },
  // Notification indexes
  {
    collection: "notifications",
    indexes: [
      { userId: 1, userType: 1, read: 1, createdAt: -1 }, // Most common query
      { delivered: 1, createdAt: -1 }, // For batch processing
    ],
  },
  // Chat Conversation indexes
  {
    collection: "chatconversations",
    indexes: [
      {
        participants: 1,
        lastMessageAt: -1,
      }, // For listing conversations
    ],
  },
  // Admin Action Log indexes
  {
    collection: "adminactionlogs",
    indexes: [
      { adminId: 1, createdAt: -1 }, // Admin activity
      { action: 1, createdAt: -1 }, // Action tracking
    ],
  },
  // Call Session indexes
  {
    collection: "callsessions",
    indexes: [
      { callerId: 1, status: 1 }, // Active calls
      { createdAt: -1 }, // Recent calls
    ],
  },
  // Student indexes
  {
    collection: "students",
    indexes: [
      { email: 1 }, // Unique lookup
      { slotId: 1, status: 1 }, // Common filter
      { createdAt: -1 }, // Time-based queries
    ],
  },
  // Reminder indexes
  {
    collection: "reminders",
    indexes: [
      { studentId: 1, status: 1 }, // Active reminders per student
      { reminderTime: 1, status: 1 }, // For cron jobs
    ],
  },
];

/**
 * Create indexes if they don't exist
 */
export const createOptimizationIndexes = async (db) => {
  try {
    for (const { collection, indexes } of requiredIndexes) {
      const col = db.collection(collection);

      for (const index of indexes) {
        await col.createIndex(index, { background: true });
      }
    }

    console.log("✅ Database indexes created successfully");
  } catch (error) {
    console.error("Error creating indexes:", error);
  }
};

/**
 * CONNECTION MONITORING
 * Track connection pool usage
 */
export const monitorConnectionPool = () => {
  const client = mongoose.connection.getClient();

  if (client && client.topology) {
    setInterval(() => {
      const poolStats = client.topology.s.poolManager?.pools?.[0];

      if (poolStats) {
        console.log("🔌 Connection Pool Stats:", {
          poolSize: poolStats.totalConnections,
          availableConnections: poolStats.availableConnections,
          checkedOutConnections: poolStats.checkedOutConnections,
        });
      }
    }, 30000); // Every 30 seconds
  }
};
