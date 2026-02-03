/**
 * Database aggregation utilities for complex queries
 * Use aggregation pipelines for better performance with large datasets
 */

/**
 * Get student statistics using aggregation
 * More efficient than multiple queries
 */
export const getStudentStatisticsAggregation = async (StudentModel) => {
  return StudentModel.aggregate([
    {
      $match: { isDeleted: false },
    },
    {
      $facet: {
        totalStudents: [
          {
            $count: "count",
          },
        ],
        activeStudents: [
          {
            $match: { status: "ACTIVE" },
          },
          {
            $count: "count",
          },
        ],
        inactiveStudents: [
          {
            $match: { status: "INACTIVE" },
          },
          {
            $count: "count",
          },
        ],
        totalMonthlyFees: [
          {
            $group: {
              _id: null,
              total: { $sum: "$monthlyFee" },
            },
          },
        ],
        studentsPerSlot: [
          {
            $match: { status: "ACTIVE" },
          },
          {
            $group: {
              _id: "$slotId",
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);
};

/**
 * Get fee summary by student with aggregation
 * Combines student and fee data efficiently
 */
export const getStudentFeeSummaryAggregation = async (
  StudentModel,
  FeeModel,
) => {
  return StudentModel.aggregate([
    {
      $match: { isDeleted: false, status: "ACTIVE" },
    },
    {
      $lookup: {
        from: FeeModel.collection.name,
        localField: "_id",
        foreignField: "studentId",
        as: "fees",
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        phone: 1,
        monthlyFee: 1,
        totalFeeAmount: {
          $sum: "$fees.amount",
        },
        paidAmount: {
          $sum: {
            $cond: [{ $eq: ["$fees.status", "PAID"] }, "$fees.amount", 0],
          },
        },
        dueAmount: {
          $sum: {
            $cond: [{ $eq: ["$fees.status", "DUE"] }, "$fees.amount", 0],
          },
        },
      },
    },
    {
      $sort: { name: 1 },
    },
  ]);
};

/**
 * Get slot capacity with student count using aggregation
 */
export const getSlotCapacityAggregation = async (SlotModel, StudentModel) => {
  return SlotModel.aggregate([
    {
      $lookup: {
        from: StudentModel.collection.name,
        let: { slotId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$slotId", "$$slotId"] },
                  { $eq: ["$status", "ACTIVE"] },
                  { $eq: ["$isDeleted", false] },
                ],
              },
            },
          },
        ],
        as: "activeStudents",
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        totalSeats: 1,
        occupiedSeats: {
          $size: "$activeStudents",
        },
        availableSeats: {
          $subtract: ["$totalSeats", { $size: "$activeStudents" }],
        },
        capacityPercent: {
          $multiply: [
            {
              $divide: [{ $size: "$activeStudents" }, "$totalSeats"],
            },
            100,
          ],
        },
      },
    },
    {
      $sort: { capacityPercent: -1 },
    },
  ]);
};

/**
 * Get monthly payment report using aggregation
 */
export const getMonthlyPaymentReportAggregation = async (
  StudentModel,
  FeeModel,
) => {
  return FeeModel.aggregate([
    {
      $match: {
        month: 2, // February (0-indexed would be 1, but assuming 1-indexed)
        year: 2024,
      },
    },
    {
      $lookup: {
        from: StudentModel.collection.name,
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        students: {
          $push: {
            id: "$student._id",
            name: "$student.name",
            amount: "$amount",
          },
        },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};
