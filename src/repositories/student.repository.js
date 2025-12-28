import { Student } from "../models/student.model.js";
import { Ledger } from "../models/ledger.model.js";

class StudentRepository {
  static async findActiveStudentsWithBillingDay(day) {
    return await Student.find({
      billingDay: day,
      status: "ACTIVE",
      isDeleted: false,
    });
  }

  static async getStudentLedger(studentId, month, year) {
    return await Ledger.findOne({
      studentId,
      billingMonth: month,
      billingYear: year,
    });
  }

  static async updateLedgerStatus(studentId, month, year, data) {
    return await Ledger.findOneAndUpdate(
      { studentId, billingMonth: month, billingYear: year },
      { $set: data },
      { new: true, upsert: true }
    );
  }

  static async getStudentWithLedgers(studentId, limit = 12) {
    return await Student.findById(studentId).lean();
  }

  static async getStudentsLedgers(studentIds, month, year) {
    return await Ledger.find({
      studentId: { $in: studentIds },
      billingMonth: month,
      billingYear: year,
    }).lean();
  }

  static async findOverdueStudents(daysOverdue = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);

    return await Ledger.aggregate([
      {
        $match: {
          paymentStatus: "UNPAID",
          createdAt: { $lte: cutoffDate },
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
          "student.reminderPaused": false,
          "student.isDeleted": false,
        },
      },
      {
        $project: {
          _id: 1,
          studentId: 1,
          studentName: "$student.name",
          dueAmount: 1,
          billingMonth: 1,
          billingYear: 1,
          createdAt: 1,
          daysOverdue: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), "$createdAt"] },
                24 * 60 * 60 * 1000,
              ],
            },
          },
        },
      },
      { $sort: { daysOverdue: -1 } },
    ]);
  }
}

export default StudentRepository;
