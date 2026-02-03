import { Student } from "../models/student.model.js";
import { Slot } from "../models/slot.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import FeeService from "./fee.service.js";

class StudentService {
  /**
   * Register new student
   */
  static async registerStudent(studentData, adminId) {
    try {
      // Check if phone already exists
      const existingStudent = await Student.findOne({
        phone: studentData.phone,
        isDeleted: false,
      });

      if (existingStudent) {
        throw new ApiError(
          409,
          "Student with this phone number already exists",
        );
      }

      // Verify slot exists and has capacity
      const slot = await Slot.findById(studentData.slotId);
      if (!slot) {
        throw new ApiError(404, "Selected slot not found");
      }

      if (!slot.isActive) {
        throw new ApiError(400, "Selected slot is not active");
      }

      // Check slot capacity
      const occupiedSeats = await Student.countDocuments({
        slotId: studentData.slotId,
        status: "ACTIVE",
      });

      if (occupiedSeats >= slot.totalSeats) {
        throw new ApiError(
          400,
          `Slot "${slot.name}" is full. Please select another slot.`,
        );
      }

      // Create student
      const student = await Student.create({
        ...studentData,
        createdBy: adminId,
      });
      // Generate initial fee record for current month
      try {
        const currentDate = new Date();
        await FeeService.ensureMonthlyFeeExists(
          student._id,
          currentDate.getMonth(),
          currentDate.getFullYear(),
          adminId,
        );
      } catch (feeError) {
        // Don't throw - student is already created
      }

      // Log the action
      try {
        await AdminActionLog.create({
          adminId,
          action: "CREATE_STUDENT",
          targetEntity: "STUDENT",
          targetId: student._id,
          newValue: studentData,
          metadata: { studentId: student._id },
        });
      } catch (logError) {
        // Don't throw here - we already created the student
      }

      return student;
    } catch (error) {
      console.error("Error in registerStudent:", error);
      throw error;
    }
  }

  /**
   * Update student
   */
  static async updateStudent(studentId, updateData, adminId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    // Store old values
    const oldValues = {
      name: student.name,
      phone: student.phone,
      email: student.email,
      address: student.address,
      fatherName: student.fatherName,
      monthlyFee: student.monthlyFee,
    };

    // If changing phone, check for duplicates
    if (updateData.phone && updateData.phone !== student.phone) {
      const phoneExists = await Student.findOne({
        phone: updateData.phone,
        isDeleted: false,
        _id: { $ne: studentId },
      });

      if (phoneExists) {
        throw new ApiError(
          409,
          "Another student already uses this phone number",
        );
      }
    }

    // Update student
    Object.assign(student, updateData);
    await student.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "UPDATE_STUDENT",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue: oldValues,
      newValue: updateData,
      metadata: { studentId: student._id },
    });

    return student;
  }

  /**
   * Archive student (soft delete)
   */
  static async archiveStudent(studentId, reason, adminId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (student.status === "ARCHIVED") {
      throw new ApiError(400, "Student is already archived");
    }

    // Store old status
    const oldStatus = student.status;

    // Archive student
    await student.archive(reason);

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "ARCHIVE_STUDENT",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue: { status: oldStatus },
      newValue: {
        status: "ARCHIVED",
        reason,
        archivedAt: new Date(),
      },
      metadata: { studentId: student._id },
    });

    return student;
  }

  /**
   * Reactivate student
   */
  static async reactivateStudent(studentId, adminId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (student.status !== "ARCHIVED") {
      throw new ApiError(400, "Student is not archived");
    }

    // Check if slot still has capacity
    const slot = await Slot.findById(student.slotId);
    if (slot) {
      const occupiedSeats = await Student.countDocuments({
        slotId: student.slotId,
        status: "ACTIVE",
      });

      if (occupiedSeats >= slot.totalSeats) {
        throw new ApiError(
          400,
          `Slot "${slot.name}" is full. Cannot reactivate student.`,
        );
      }
    }

    // Reactivate
    await student.reactivate();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "REACTIVATE_STUDENT",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue: { status: "ARCHIVED" },
      newValue: { status: "ACTIVE" },
      metadata: { studentId: student._id },
    });

    return student;
  }

  /**
   * Get student with complete details
   */
  static async getStudentDetails(studentId) {
    const student = await Student.findById(studentId).populate(
      "slotId",
      "name timeRange monthlyFee",
    );

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    // Get fee summary
    const feeSummary = await FeeService.getStudentFeeSummary(studentId);

    return {
      student: student.toObject(),
      feeSummary,
    };
  }

  /**
   * Search students
   */
  static async searchStudents(query, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Build search filter
    const filter = { isDeleted: false };

    if (query.search) {
      const searchRegex = new RegExp(query.search, "i");
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { fatherName: searchRegex },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.slotId) {
      filter.slotId = query.slotId;
    }

    // Execute query
    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate("slotId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    return {
      students,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get students by slot
   */
  static async getStudentsBySlot(slotId, status = "ACTIVE") {
    const students = await Student.find({
      slotId,
      status,
      isDeleted: false,
    })
      .populate("slotId", "name timeRange")
      .sort({ name: 1 })
      .lean();

    return students;
  }
}

export default StudentService;
