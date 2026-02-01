import { Student } from "../models/student.model.js";
import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";
import { DueRecord } from "../models/dueRecord.model.js";

class StudentRepository {
  // Find active students with billing day
  static async findActiveStudentsWithBillingDay(day) {
    return await Student.find({
      billingDay: day,
      status: "ACTIVE",
      isDeleted: false,
    });
  }

  // Get student monthly fee
  static async getStudentMonthlyFee(studentId, month, year) {
    return await StudentMonthlyFee.findOne({
      studentId,
      month,
      year,
    });
  }

  // Update monthly fee status
  static async updateMonthlyFeeStatus(studentId, month, year, data) {
    return await StudentMonthlyFee.findOneAndUpdate(
      { studentId, month, year },
      { $set: data },
      { new: true, upsert: true }
    );
  }

  // Get student with fee history
  static async getStudentWithFeeHistory(studentId, limit = 12) {
    const student = await Student.findById(studentId).lean();

    if (!student) return null;

    const monthlyFees = await StudentMonthlyFee.find({ studentId })
      .sort({ year: -1, month: -1 })
      .limit(limit)
      .lean();

    const advanceBalance = await AdvanceBalance.findOne({ studentId }).lean();
    const dueRecord = await DueRecord.findOne({
      studentId,
      resolved: false,
    }).lean();

    return {
      ...student,
      monthlyFees,
      advanceBalance,
      dueRecord,
    };
  }

  // Get multiple students' fees
  static async getStudentsMonthlyFees(studentIds, month, year) {
    return await StudentMonthlyFee.find({
      studentId: { $in: studentIds },
      month,
      year,
    }).lean();
  }

  // Find overdue students
  static async findOverdueStudents(daysOverdue = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

    return await StudentMonthlyFee.aggregate([
      {
        $match: {
          status: "DUE",
          updatedAt: { $lte: cutoffDate },
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
        $project: {
          _id: 1,
          studentId: 1,
          studentName: "$student.name",
          totalAmount: { $add: ["$baseFee", "$dueCarriedForwardAmount"] },
          month: 1,
          year: 1,
          updatedAt: 1,
          daysOverdue: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), "$updatedAt"] },
                24 * 60 * 60 * 1000,
              ],
            },
          },
        },
      },
      { $sort: { daysOverdue: -1 } },
    ]);
  }

  // Get advance balance
  static async getAdvanceBalance(studentId) {
    return await AdvanceBalance.findOne({ studentId });
  }

  // Update advance balance
  static async updateAdvanceBalance(studentId, data) {
    return await AdvanceBalance.findOneAndUpdate(
      { studentId },
      { $set: data },
      { new: true, upsert: true }
    );
  }

  // Get due record
  static async getDueRecord(studentId) {
    return await DueRecord.findOne({ studentId, resolved: false });
  }

  // Update due record
  static async updateDueRecord(studentId, data) {
    return await DueRecord.findOneAndUpdate(
      { studentId },
      { $set: data },
      { new: true, upsert: true }
    );
  }
}

export default StudentRepository;
