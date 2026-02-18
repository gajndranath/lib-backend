/**
 * Analytics Service
 * Handles dashboard statistics and financial reporting.
 * All slot occupancy and fee stats use single aggregation pipelines
 * to avoid N+1 query problems.
 */

import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { Slot } from "../models/slot.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";

class AnalyticsService {
  /**
   * Get dashboard statistics
   * Uses Promise.all + single aggregations — no N+1 loops.
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
      // Single aggregation for slot occupancy — replaces the per-slot loop
      slotOccupancy,
      // Single aggregation for 6-month trend — replaces the 6-iteration loop
      monthlyTrendRaw,
    ] = await Promise.all([
      Student.countDocuments({ isDeleted: false }),
      Student.countDocuments({ status: "ACTIVE", isDeleted: false }),
      Student.countDocuments({ status: "ARCHIVED", isDeleted: false }),
      Slot.countDocuments({ isActive: true }),

      // Current month fee stats
      StudentMonthlyFee.aggregate([
        { $match: { month: currentMonth, year: currentYear } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] } },
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
            utilizedAdvance: { $sum: { $subtract: ["$totalAmount", "$remainingAmount"] } },
          },
        },
      ]),

      // Overdue stats
      DueRecord.aggregate([
        { $match: { resolved: false } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalDueAmount" },
          },
        },
      ]),

      // Slot occupancy — single aggregation replaces N per-slot queries
      Student.aggregate([
        { $match: { status: "ACTIVE", isDeleted: false } },
        { $group: { _id: "$slotId", occupiedSeats: { $sum: 1 } } },
      ]),

      // 6-month trend — single aggregation replaces 6 sequential queries
      StudentMonthlyFee.aggregate([
        {
          $match: (() => {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
            // Build an $or covering the last 6 month/year combos
            const periods = [];
            for (let i = 5; i >= 0; i--) {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              periods.push({ month: d.getMonth(), year: d.getFullYear() });
            }
            return { $or: periods.map(({ month, year }) => ({ month, year })) };
          })(),
        },
        {
          $group: {
            _id: { year: "$year", month: "$month" },
            paid: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } },
            due: { $sum: { $cond: [{ $eq: ["$status", "DUE"] }, 1, 0] } },
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
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    // Build occupancy map: slotId → occupiedSeats
    const occupancyMap = new Map(
      slotOccupancy.map((s) => [s._id?.toString(), s.occupiedSeats]),
    );

    // Fetch all active slots (metadata only)
    const slots = await Slot.find({ isActive: true }).lean();
    const slotsWithOccupancy = slots.map((slot) => {
      const occupiedSeats = occupancyMap.get(slot._id.toString()) || 0;
      return {
        ...slot,
        occupiedSeats,
        availableSeats: slot.totalSeats - occupiedSeats,
        occupancyPercentage: Math.round((occupiedSeats / slot.totalSeats) * 100),
      };
    });

    // Process fee stats
    const feeStatsObj = { paid: 0, due: 0, pending: 0, paidAmount: 0, dueAmount: 0, pendingAmount: 0 };
    feeStats.forEach((stat) => {
      feeStatsObj[stat._id.toLowerCase()] = stat.count;
      feeStatsObj[`${stat._id.toLowerCase()}Amount`] = stat.totalAmount;
    });

    // Build monthly trend from aggregation result
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.getMonth();
      const year = d.getFullYear();
      const monthName = d.toLocaleString("default", { month: "short" });

      const found = monthlyTrendRaw.find(
        (r) => r._id.month === month && r._id.year === year,
      ) || { paid: 0, due: 0, paidAmount: 0, dueAmount: 0 };

      monthlyTrend.push({
        month: `${monthName} ${year}`,
        paid: found.paid,
        due: found.due,
        paidAmount: found.paidAmount,
        dueAmount: found.dueAmount,
      });
    }

    return {
      overview: {
        totalStudents,
        activeStudents,
        archivedStudents,
        totalSlots,
        slotsWithOccupancy,
        advance: advanceBalance[0] || { totalAdvance: 0, remainingAdvance: 0, utilizedAdvance: 0 },
        overdue: overdueStats[0] || { count: 0, totalAmount: 0 },
      },
      currentMonth: { month: currentMonth, year: currentYear, ...feeStatsObj },
      monthlyTrend,
      generatedAt: new Date(),
    };
  }

  /**
   * Get slot-wise analytics
   * Single aggregation per metric replaces triple N+1 loops.
   */
  static async getSlotAnalytics() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const slots = await Slot.find({ isActive: true }).lean();
    const slotIds = slots.map((s) => s._id);

    // Run all 3 aggregations in parallel — one pass each, not per-slot
    const [occupancyCounts, feeStatsBySlot, advanceStatsBySlot] = await Promise.all([
      // Occupancy: group active students by slotId
      Student.aggregate([
        { $match: { slotId: { $in: slotIds }, status: "ACTIVE", isDeleted: false } },
        { $group: { _id: "$slotId", count: { $sum: 1 } } },
      ]),

      // Fee stats: join fees → students → group by slotId + status
      StudentMonthlyFee.aggregate([
        { $match: { month: currentMonth, year: currentYear } },
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
            "student.slotId": { $in: slotIds },
            "student.status": "ACTIVE",
          },
        },
        {
          $group: {
            _id: { slotId: "$student.slotId", status: "$status" },
            count: { $sum: 1 },
            totalAmount: { $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] } },
          },
        },
      ]),

      // Advance stats: join advance → students → group by slotId
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
            "student.slotId": { $in: slotIds },
            "student.status": "ACTIVE",
          },
        },
        {
          $group: {
            _id: "$student.slotId",
            totalAdvance: { $sum: "$totalAmount" },
            remainingAdvance: { $sum: "$remainingAmount" },
          },
        },
      ]),
    ]);

    // Build lookup maps
    const occupancyMap = new Map(occupancyCounts.map((o) => [o._id.toString(), o.count]));
    const advanceMap = new Map(advanceStatsBySlot.map((a) => [a._id.toString(), a]));

    // Build fee stats map: slotId → { PAID, DUE, PENDING }
    const feeMap = new Map();
    for (const f of feeStatsBySlot) {
      const key = f._id.slotId.toString();
      if (!feeMap.has(key)) feeMap.set(key, {});
      feeMap.get(key)[f._id.status] = { count: f.count, totalAmount: f.totalAmount };
    }

    return slots.map((slot) => {
      const key = slot._id.toString();
      const studentCount = occupancyMap.get(key) || 0;
      const fees = feeMap.get(key) || {};
      const paid = fees.PAID || { count: 0, totalAmount: 0 };
      const due = fees.DUE || { count: 0, totalAmount: 0 };
      const pending = fees.PENDING || { count: 0, totalAmount: 0 };
      const advance = advanceMap.get(key) || { totalAdvance: 0, remainingAdvance: 0 };

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
          occupancyPercentage: Math.round((studentCount / slot.totalSeats) * 100),
        },
        fees: {
          totalStudents: studentCount,
          paid: paid.count,
          due: due.count,
          pending: pending.count,
          paidAmount: paid.totalAmount,
          dueAmount: due.totalAmount,
          pendingAmount: pending.totalAmount,
          collectionRate: studentCount > 0 ? Math.round((paid.count / studentCount) * 100) : 0,
        },
        advance,
      };
    });
  }

  /**
   * Get financial report for a date range
   */
  static async getFinancialReport(startMonth, startYear, endMonth, endYear) {
    const matchStage = {
      $match: {
        $or: [
          { $and: [{ year: { $gt: startYear } }, { year: { $lt: endYear } }] },
          { $and: [{ year: startYear }, { month: { $gte: startMonth } }] },
          { $and: [{ year: endYear }, { month: { $lte: endMonth } }] },
        ],
      },
    };

    const report = await StudentMonthlyFee.aggregate([
      matchStage,
      {
        $group: {
          _id: { year: "$year", month: "$month" },
          totalStudents: { $sum: 1 },
          paidCount: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } },
          dueCount: { $sum: { $cond: [{ $eq: ["$status", "DUE"] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
          totalAmount: { $sum: { $add: ["$baseFee", "$dueCarriedForwardAmount"] } },
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
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const formattedReport = report.map((item) => ({
      period: `${monthNames[item._id.month]} ${item._id.year}`,
      year: item._id.year,
      month: item._id.month,
      totalStudents: item.totalStudents,
      paid: {
        count: item.paidCount,
        amount: item.paidAmount,
        percentage: item.totalStudents > 0 ? Math.round((item.paidCount / item.totalStudents) * 100) : 0,
      },
      due: {
        count: item.dueCount,
        amount: item.dueAmount,
        percentage: item.totalStudents > 0 ? Math.round((item.dueCount / item.totalStudents) * 100) : 0,
      },
      pending: {
        count: item.pendingCount,
        amount: item.totalAmount - item.paidAmount - item.dueAmount,
        percentage: item.totalStudents > 0 ? Math.round((item.pendingCount / item.totalStudents) * 100) : 0,
      },
      totals: {
        expected: item.totalAmount,
        collected: item.paidAmount,
        pending: item.dueAmount + (item.totalAmount - item.paidAmount - item.dueAmount),
        collectionRate: item.totalAmount > 0 ? Math.round((item.paidAmount / item.totalAmount) * 100) : 0,
      },
    }));

    const summary = formattedReport.reduce(
      (acc, item) => ({
        totalStudents: acc.totalStudents + item.totalStudents,
        totalExpected: acc.totalExpected + item.totals.expected,
        totalCollected: acc.totalCollected + item.totals.collected,
        totalPending: acc.totalPending + item.totals.pending,
      }),
      { totalStudents: 0, totalExpected: 0, totalCollected: 0, totalPending: 0 },
    );

    summary.collectionRate =
      summary.totalExpected > 0
        ? Math.round((summary.totalCollected / summary.totalExpected) * 100)
        : 0;

    return {
      period: { start: `${startMonth + 1}/${startYear}`, end: `${endMonth + 1}/${endYear}` },
      report: formattedReport,
      summary,
      generatedAt: new Date(),
    };
  }
}

export default AnalyticsService;
