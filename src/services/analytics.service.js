import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { Slot } from "../models/slot.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";

class AnalyticsService {
  /**
   * Get dashboard statistics
   */
  static async getDashboardStats() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const [
      totalStudents,
      activeStudents,
      archivedStudents,
      totalSlots,
      feeStats,
      advanceBalance,
      overdueStats,
    ] = await Promise.all([
      // Student counts
      Student.countDocuments({ isDeleted: false }),
      Student.countDocuments({ status: "ACTIVE", isDeleted: false }),
      Student.countDocuments({ status: "ARCHIVED", isDeleted: false }),

      // Slot counts
      Slot.countDocuments({ isActive: true }),

      // Current month fee stats
      StudentMonthlyFee.aggregate([
        {
          $match: {
            month: currentMonth,
            year: currentYear,
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: {
              $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
            },
          },
        },
      ]),

      // Total advance balance
      AdvanceBalance.aggregate([
        {
          $group: {
            _id: null,
            totalAdvance: { $sum: "$totalAmount" },
            remainingAdvance: { $sum: "$remainingAmount" },
            utilizedAdvance: {
              $sum: { $subtract: ["$totalAmount", "$remainingAmount"] },
            },
          },
        },
      ]),

      // Overdue stats
      DueRecord.aggregate([
        {
          $match: { resolved: false },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalDueAmount" },
          },
        },
      ]),
    ]);

    // Process fee stats
    const feeStatsObj = {
      paid: 0,
      due: 0,
      pending: 0,
      paidAmount: 0,
      dueAmount: 0,
      pendingAmount: 0,
    };

    feeStats.forEach((stat) => {
      feeStatsObj[stat._id.toLowerCase()] = stat.count;
      feeStatsObj[`${stat._id.toLowerCase()}Amount`] = stat.totalAmount;
    });

    // Slot occupancy
    const slots = await Slot.find({ isActive: true }).lean();
    const slotsWithOccupancy = await Promise.all(
      slots.map(async (slot) => {
        const occupiedSeats = await Student.countDocuments({
          slotId: slot._id,
          status: "ACTIVE",
        });

        return {
          ...slot,
          occupiedSeats,
          availableSeats: slot.totalSeats - occupiedSeats,
          occupancyPercentage: Math.round(
            (occupiedSeats / slot.totalSeats) * 100
          ),
        };
      })
    );

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth();
      const year = date.getFullYear();

      const monthStats = await StudentMonthlyFee.aggregate([
        {
          $match: {
            month,
            year,
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: {
              $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
            },
          },
        },
      ]);

      const monthName = date.toLocaleString("default", { month: "short" });
      const paidStats = monthStats.find((s) => s._id === "PAID") || {
        count: 0,
        amount: 0,
      };
      const dueStats = monthStats.find((s) => s._id === "DUE") || {
        count: 0,
        amount: 0,
      };

      monthlyTrend.push({
        month: `${monthName} ${year}`,
        paid: paidStats.count,
        due: dueStats.count,
        paidAmount: paidStats.amount,
        dueAmount: dueStats.amount,
      });
    }

    return {
      overview: {
        totalStudents,
        activeStudents,
        archivedStudents,
        totalSlots,
        slotsWithOccupancy,
        advance: advanceBalance[0] || {
          totalAdvance: 0,
          remainingAdvance: 0,
          utilizedAdvance: 0,
        },
        overdue: overdueStats[0] || { count: 0, totalAmount: 0 },
      },
      currentMonth: {
        month: currentMonth,
        year: currentYear,
        ...feeStatsObj,
      },
      monthlyTrend,
      generatedAt: new Date(),
    };
  }

  /**
   * Get slot-wise analytics
   */
  static async getSlotAnalytics() {
    const slots = await Slot.find({ isActive: true }).lean();

    const slotAnalytics = await Promise.all(
      slots.map(async (slot) => {
        const [studentCount, feeStats, advanceStats] = await Promise.all([
          // Student count
          Student.countDocuments({
            slotId: slot._id,
            status: "ACTIVE",
            isDeleted: false,
          }),

          // Fee collection stats
          StudentMonthlyFee.aggregate([
            {
              $match: {
                month: new Date().getMonth(),
                year: new Date().getFullYear(),
              },
            },
            {
              $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "student",
              },
            },
            { $unwind: "$student" },
            {
              $match: {
                "student.slotId": slot._id,
                "student.status": "ACTIVE",
              },
            },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: {
                  $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
                },
              },
            },
          ]),

          // Advance stats
          AdvanceBalance.aggregate([
            {
              $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "student",
              },
            },
            { $unwind: "$student" },
            {
              $match: {
                "student.slotId": slot._id,
                "student.status": "ACTIVE",
              },
            },
            {
              $group: {
                _id: null,
                totalAdvance: { $sum: "$totalAmount" },
                remainingAdvance: { $sum: "$remainingAmount" },
              },
            },
          ]),
        ]);

        // Process fee stats
        const paidStats = feeStats.find((s) => s._id === "PAID") || {
          count: 0,
          totalAmount: 0,
        };
        const dueStats = feeStats.find((s) => s._id === "DUE") || {
          count: 0,
          totalAmount: 0,
        };
        const pendingStats = feeStats.find((s) => s._id === "PENDING") || {
          count: 0,
          totalAmount: 0,
        };

        return {
          slot: {
            id: slot._id,
            name: slot.name,
            timeRange: slot.timeRange,
            totalSeats: slot.totalSeats,
            monthlyFee: slot.monthlyFee,
          },
          occupancy: {
            totalSeats: slot.totalSeats,
            occupiedSeats: studentCount,
            availableSeats: slot.totalSeats - studentCount,
            occupancyPercentage: Math.round(
              (studentCount / slot.totalSeats) * 100
            ),
          },
          fees: {
            totalStudents: studentCount,
            paid: paidStats.count,
            due: dueStats.count,
            pending: pendingStats.count,
            paidAmount: paidStats.totalAmount,
            dueAmount: dueStats.totalAmount,
            pendingAmount: pendingStats.totalAmount,
            collectionRate:
              studentCount > 0
                ? Math.round((paidStats.count / studentCount) * 100)
                : 0,
          },
          advance: advanceStats[0] || {
            totalAdvance: 0,
            remainingAdvance: 0,
          },
        };
      })
    );

    return slotAnalytics;
  }

  /**
   * Get financial report
   */
  static async getFinancialReport(startMonth, startYear, endMonth, endYear) {
    // Build date filter
    const matchStage = {
      $match: {
        $or: [
          {
            $and: [{ year: { $gt: startYear } }, { year: { $lt: endYear } }],
          },
          {
            $and: [{ year: startYear }, { month: { $gte: startMonth } }],
          },
          {
            $and: [{ year: endYear }, { month: { $lte: endMonth } }],
          },
        ],
      },
    };

    const report = await StudentMonthlyFee.aggregate([
      matchStage,
      {
        $group: {
          _id: {
            year: "$year",
            month: "$month",
          },
          totalStudents: { $sum: 1 },
          paidCount: {
            $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] },
          },
          dueCount: {
            $sum: { $cond: [{ $eq: ["$status", "DUE"] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
          },
          totalAmount: {
            $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
          },
          paidAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", "PAID"] },
                { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
                0,
              ],
            },
          },
          dueAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", "DUE"] },
                { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
                0,
              ],
            },
          },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
    ]);

    // Format report
    const formattedReport = report.map((item) => {
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      return {
        period: `${monthNames[item._id.month]} ${item._id.year}`,
        year: item._id.year,
        month: item._id.month,
        totalStudents: item.totalStudents,
        paid: {
          count: item.paidCount,
          amount: item.paidAmount,
          percentage:
            item.totalStudents > 0
              ? Math.round((item.paidCount / item.totalStudents) * 100)
              : 0,
        },
        due: {
          count: item.dueCount,
          amount: item.dueAmount,
          percentage:
            item.totalStudents > 0
              ? Math.round((item.dueCount / item.totalStudents) * 100)
              : 0,
        },
        pending: {
          count: item.pendingCount,
          amount: item.totalAmount - item.paidAmount - item.dueAmount,
          percentage:
            item.totalStudents > 0
              ? Math.round((item.pendingCount / item.totalStudents) * 100)
              : 0,
        },
        totals: {
          expected: item.totalAmount,
          collected: item.paidAmount,
          pending:
            item.dueAmount +
            (item.totalAmount - item.paidAmount - item.dueAmount),
          collectionRate:
            item.totalAmount > 0
              ? Math.round((item.paidAmount / item.totalAmount) * 100)
              : 0,
        },
      };
    });

    // Calculate summary
    const summary = formattedReport.reduce(
      (acc, item) => ({
        totalStudents: acc.totalStudents + item.totalStudents,
        totalExpected: acc.totalExpected + item.totals.expected,
        totalCollected: acc.totalCollected + item.totals.collected,
        totalPending: acc.totalPending + item.totals.pending,
      }),
      {
        totalStudents: 0,
        totalExpected: 0,
        totalCollected: 0,
        totalPending: 0,
      }
    );

    summary.collectionRate =
      summary.totalExpected > 0
        ? Math.round((summary.totalCollected / summary.totalExpected) * 100)
        : 0;

    return {
      period: {
        start: `${startMonth + 1}/${startYear}`,
        end: `${endMonth + 1}/${endYear}`,
      },
      report: formattedReport,
      summary,
      generatedAt: new Date(),
    };
  }
}

export default AnalyticsService;
