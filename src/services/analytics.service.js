import { Ledger } from "../models/ledger.model.js";
import { Student } from "../models/student.model.js";
import mongoose from "mongoose";

class AnalyticsService {
  static async getMonthlyReport(month, year) {
    const currentMonth = month ? parseInt(month) : new Date().getMonth();
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    const stats = await Ledger.aggregate([
      {
        $match: {
          billingMonth: currentMonth,
          billingYear: currentYear,
        },
      },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: "$dueAmount" },
          totalReceived: { $sum: "$paidAmount" },
          pendingAmount: { $sum: { $subtract: ["$dueAmount", "$paidAmount"] } },
          paidStudents: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, 1, 0] },
          },
          unpaidStudents: {
            $sum: { $cond: [{ $ne: ["$paymentStatus", "PAID"] }, 1, 0] },
          },
          partialPayments: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "PARTIAL"] }, 1, 0] },
          },
          advancePayments: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "ADVANCE"] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      stats[0] || {
        totalExpected: 0,
        totalReceived: 0,
        pendingAmount: 0,
        paidStudents: 0,
        unpaidStudents: 0,
        partialPayments: 0,
        advancePayments: 0,
      }
    );
  }

  static async getDashboardStats() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Total active students
    const totalStudents = await Student.countDocuments({
      status: "ACTIVE",
      isDeleted: false,
    });

    // This month's stats
    const monthlyStats = await Ledger.aggregate([
      {
        $match: {
          billingMonth: currentMonth,
          billingYear: currentYear,
        },
      },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: "$dueAmount" },
          totalReceived: { $sum: "$paidAmount" },
          pendingAmount: { $sum: { $subtract: ["$dueAmount", "$paidAmount"] } },
        },
      },
    ]);

    // Overdue students (unpaid from previous months)
    const overdueStats = await Ledger.aggregate([
      {
        $match: {
          paymentStatus: "UNPAID",
          $or: [
            { billingYear: { $lt: currentYear } },
            {
              $and: [
                { billingYear: currentYear },
                { billingMonth: { $lt: currentMonth } },
              ],
            },
          ],
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
          "student.status": "ACTIVE",
          "student.isDeleted": false,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: "$dueAmount" },
        },
      },
    ]);

    return {
      totalStudents,
      monthly: monthlyStats[0] || {
        totalExpected: 0,
        totalReceived: 0,
        pendingAmount: 0,
      },
      overdue: overdueStats[0] || { count: 0, totalAmount: 0 },
      activeAdmins: 1, // In production, get from connected sockets
      lastUpdated: new Date(),
    };
  }

  static async getYearlyReport(year) {
    const currentYear = year || new Date().getFullYear();

    const monthlyData = await Ledger.aggregate([
      {
        $match: {
          billingYear: currentYear,
        },
      },
      {
        $group: {
          _id: "$billingMonth",
          totalExpected: { $sum: "$dueAmount" },
          totalReceived: { $sum: "$paidAmount" },
          paidStudents: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing months
    const completeData = [];
    for (let month = 0; month < 12; month++) {
      const monthData = monthlyData.find((m) => m._id === month);
      completeData.push({
        month,
        monthName: new Date(currentYear, month, 1).toLocaleString("default", {
          month: "short",
        }),
        totalExpected: monthData?.totalExpected || 0,
        totalReceived: monthData?.totalReceived || 0,
        paidStudents: monthData?.paidStudents || 0,
      });
    }

    return completeData;
  }
}

export default AnalyticsService;
