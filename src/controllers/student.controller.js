import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Student } from "../models/student.model.js";
import { Ledger } from "../models/ledger.model.js";
import { PaymentStatus, StudentStatus } from "../constants.js";
import { studentRegistrationSchema } from "../utils/validators.js";
import NotificationService from "../services/notification.service.js";

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { studentId, month, year, status, remarks, amount } = req.body;

  if (!studentId || status === undefined) {
    throw new ApiError(400, "Student ID and Status are required");
  }

  // Find student
  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found");

  // 1. Database Update
  const updateData = {
    paymentStatus: status,
    remarks: remarks || "",
  };

  if (status === PaymentStatus.PAID) {
    updateData.paidAmount = amount || student.monthlyFees;
    updateData.paymentDate = new Date();
  } else if (status === PaymentStatus.PARTIAL && amount) {
    updateData.paidAmount = amount;
    updateData.paymentDate = new Date();
  } else {
    updateData.paidAmount = 0;
    updateData.paymentDate = null;
  }

  const updatedLedger = await Ledger.findOneAndUpdate(
    { studentId, billingMonth: month, billingYear: year },
    { $set: updateData },
    { new: true, upsert: true }
  ).populate("studentId");

  // 2. Real-time Sync via Socket.io
  const io = req.app.get("io");
  io.to("admins").emit("payment_sync", {
    studentId,
    studentName: student.name,
    month,
    year,
    status: updatedLedger.paymentStatus,
    amount: updatedLedger.paidAmount,
    updatedBy: req.admin.username,
    timestamp: new Date(),
  });

  // 3. Send notification if payment received
  if (status === PaymentStatus.PAID) {
    const admins = await Admin.find({ "notificationPreferences.push": true });

    for (const admin of admins) {
      if (
        admin.webPushSubscription &&
        admin._id.toString() !== req.admin._id.toString()
      ) {
        await NotificationService.sendWebPush(admin.webPushSubscription, {
          title: "💰 Payment Received",
          body: `${student.name} paid ₹${updatedLedger.paidAmount} for ${
            month + 1
          }/${year}`,
          icon: "/icons/icon-192x192.png",
          data: {
            studentId: student._id.toString(),
            type: "payment_received",
            url: `/student/${student._id}`,
          },
        });
      }
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedLedger, "Payment status updated and synced")
    );
});

export const registerStudent = asyncHandler(async (req, res) => {
  // 1. Validate Input
  const validation = studentRegistrationSchema.safeParse(req.body);
  if (!validation.success) {
    throw new ApiError(400, "Validation Error", validation.error.errors);
  }

  const { name, phone, monthlyFees, joiningDate } = req.body;

  // 2. Business Logic
  const existedStudent = await Student.findOne({ phone });
  if (existedStudent) throw new ApiError(409, "Student already exists");

  const dateObj = joiningDate ? new Date(joiningDate) : new Date();

  const student = await Student.create({
    name,
    phone,
    monthlyFees,
    joiningDate: dateObj,
    billingDay: dateObj.getDate(),
  });

  // 3. Create Initial Ledger entry
  await Ledger.create({
    studentId: student._id,
    billingMonth: dateObj.getMonth(),
    billingYear: dateObj.getFullYear(),
    dueAmount: monthlyFees,
  });

  // 4. Send notification to admins
  const io = req.app.get("io");
  io.to("admins").emit("student_added", {
    studentId: student._id,
    studentName: student.name,
    addedBy: req.admin.username,
    timestamp: new Date(),
  });

  return res.status(201).json(new ApiResponse(201, student, "Student Added"));
});

export const getDashboardData = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const currentMonth = month ? parseInt(month) : new Date().getMonth();
  const currentYear = year ? parseInt(year) : new Date().getFullYear();

  const students = await Student.find({ isDeleted: false, status: "ACTIVE" });

  const dashboardList = await Promise.all(
    students.map(async (student) => {
      const ledger = await Ledger.findOne({
        studentId: student._id,
        billingMonth: currentMonth,
        billingYear: currentYear,
      });

      return {
        ...student._doc,
        paymentStatus: ledger ? ledger.paymentStatus : "NOT_GENERATED",
        dueAmount: ledger ? ledger.dueAmount : student.monthlyFees,
        paidAmount: ledger ? ledger.paidAmount : 0,
        paymentDate: ledger ? ledger.paymentDate : null,
        remarks: ledger ? ledger.remarks : "",
      };
    })
  );

  // Calculate summary
  const summary = {
    totalStudents: students.length,
    paidStudents: dashboardList.filter((s) => s.paymentStatus === "PAID")
      .length,
    unpaidStudents: dashboardList.filter((s) => s.paymentStatus === "UNPAID")
      .length,
    pendingStudents: dashboardList.filter(
      (s) => s.paymentStatus === "NOT_GENERATED"
    ).length,
    totalExpected: dashboardList.reduce((sum, s) => sum + s.dueAmount, 0),
    totalReceived: dashboardList.reduce((sum, s) => sum + s.paidAmount, 0),
    totalPending: dashboardList.reduce(
      (sum, s) => sum + (s.dueAmount - s.paidAmount),
      0
    ),
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { students: dashboardList, summary },
        "Dashboard data fetched"
      )
    );
});

export const toggleStudentReminder = asyncHandler(async (req, res) => {
  const { studentId, pause } = req.body;

  const student = await Student.findByIdAndUpdate(
    studentId,
    { reminderPaused: pause },
    { new: true }
  );

  if (!student) throw new ApiError(404, "Student not found");

  const message = pause
    ? "Reminders paused for this student"
    : "Reminders enabled for this student";

  return res.status(200).json(new ApiResponse(200, student, message));
});

export const getStudentHistory = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found");

  const ledgers = await Ledger.find({ studentId })
    .sort({ billingYear: -1, billingMonth: -1 })
    .limit(12);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { student, ledgers }, "Student history fetched")
    );
});
