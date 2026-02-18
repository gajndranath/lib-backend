import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Attendance } from "../models/attendance.model.js";
import { Student } from "../models/student.model.js";

// Helper to normalize date to midnight
const normalizeDate = (dateString) => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Mark attendance (Upsert)
export const markAttendance = asyncHandler(async (req, res) => {
  const { studentId, date, status, checkInTime, checkOutTime } = req.body;

  if (!studentId || !date || !status) {
    throw new ApiError(400, "Student ID, date, and status are required");
  }

  const attendanceDate = normalizeDate(date);

  const attendance = await Attendance.findOneAndUpdate(
    {
      studentId,
      date: attendanceDate,
      tenantId: req.tenantId, // Tenant isolation
    },
    {
      status,
      checkInTime: checkInTime ? new Date(checkInTime) : undefined,
      checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
      markedBy: req.admin._id,
      tenantId: req.tenantId,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, attendance, "Attendance marked successfully"));
});

// Get daily attendance for all active students
export const getDailyAttendance = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    throw new ApiError(400, "Date is required");
  }

  const targetDate = normalizeDate(date);

  // 1. Get all active students
  const students = await Student.find({
    status: "ACTIVE",
    isDeleted: false,
    tenantId: req.tenantId, // Tenant isolation
  })
    .select("_id name seatNumber shift")
    .lean();

  // 2. Get attendance records for this date
  const attendanceRecords = await Attendance.find({
    date: targetDate,
    tenantId: req.tenantId,
  }).lean();

  // 3. Map attendance to students
  const attendanceMap = new Map();
  attendanceRecords.forEach((record) => {
    attendanceMap.set(record.studentId.toString(), record);
  });

  const dailyReport = students.map((student) => {
    const record = attendanceMap.get(student._id.toString());
    return {
      studentId: student._id,
      name: student.name,
      seatNumber: student.seatNumber,
      shift: student.shift,
      status: record ? record.status : "NOT_MARKED",
      checkInTime: record ? record.checkInTime : null,
      checkOutTime: record ? record.checkOutTime : null,
      attendanceId: record ? record._id : null,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date: targetDate,
        totalStudents: students.length,
        presentCount: attendanceRecords.filter((r) => r.status === "PRESENT")
          .length,
        absentCount: attendanceRecords.filter((r) => r.status === "ABSENT")
          .length,
        records: dailyReport,
      },
      "Daily attendance fetched successfully"
    )
  );
});

// Get consolidated stats for a month
export const getMonthlyAttendanceStats = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const currentDate = new Date();
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();
  const targetMonth = month ? parseInt(month) : currentDate.getMonth(); // 0-indexed

  const startOfMonth = new Date(targetYear, targetMonth, 1);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

  const stats = await Attendance.aggregate([
    {
      $match: {
        tenantId: req.tenantId, // Tenant isolation
        date: { $gte: startOfMonth, $lte: endOfMonth },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        month: targetMonth,
        year: targetYear,
        stats,
      },
      "Monthly stats fetched"
    )
  );
});
