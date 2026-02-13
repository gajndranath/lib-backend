import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS, CACHE_TTL } from "../utils/cacheStrategy.js";
import FeeService from "./fee.service.js";
import {
  generateLibraryId,
  checkEmailExists,
  checkPhoneExists,
} from "../utils/studentHelpers.js";
import {
  validateSlotChange,
  validateSlotHasCapacity,
} from "../utils/slotHelpers.js";

class StudentService {
  /**
   * Admin creates new student
   * - Requires slot assignment
   * - Creates billing immediately
   * - Status can be ACTIVE
   */
  static async registerStudent(studentData, adminId) {
    try {
      // ✅ Check email uniqueness (if provided)
      if (studentData.email) {
        const existingEmail = await checkEmailExists(studentData.email);
        if (existingEmail) {
          throw new ApiError(409, "Email already registered");
        }
      }

      // ✅ Check phone uniqueness
      const existingPhone = await checkPhoneExists(studentData.phone);
      if (existingPhone) {
        throw new ApiError(409, "Phone number already registered");
      }

      // ✅ Verify slot exists, is active, and has capacity
      await validateSlotHasCapacity(studentData.slotId);

      // ✅ Generate library ID
      const libraryId = await generateLibraryId();

      // ✅ Create student
      const student = await Student.create({
        ...studentData,
        libraryId,
        createdBy: adminId,
        emailVerified: false, // Admin can verify later or student verifies via OTP
      });

      // ✅ Generate initial fee record for current month
      try {
        const currentDate = new Date();
        await FeeService.ensureMonthlyFeeExists(
          student._id,
          currentDate.getMonth(),
          currentDate.getFullYear(),
          adminId,
        );
        console.log(`✅ Monthly fee record created for ${student.libraryId}`);
      } catch (feeError) {
        console.error("❌ Failed to create fee record:", feeError.message);
        // Don't throw - student is already created
      }

      // ✅ Log the admin action
      try {
        await AdminActionLog.create({
          adminId,
          action: "CREATE_STUDENT",
          targetEntity: "STUDENT",
          targetId: student._id,
          newValue: { ...studentData, libraryId },
          metadata: { studentId: student._id, libraryId },
        });
      } catch (logError) {
        console.error("❌ Failed to log admin action:", logError.message);
        // Don't throw - student is already created
      }

      return student;
    } catch (error) {
      console.error("❌ Error in registerStudent:", error.message);
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
      })
        .select("_id")
        .lean();

      if (phoneExists) {
        throw new ApiError(
          409,
          "Another student already uses this phone number",
        );
      }
    }

    // Validate slot change if slotId is being updated
    if (
      updateData.slotId &&
      updateData.slotId.toString() !== student.slotId?.toString()
    ) {
      if (student.slotId) {
        validateSlotChange(student.slotId, updateData.slotId);
      }
      await validateSlotHasCapacity(updateData.slotId);
    }

    // Update student
    Object.assign(student, updateData);
    await student.save();

    // Invalidate student cache
    await cacheService.del(CACHE_KEYS.STUDENT(studentId));

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

    // Invalidate student cache
    await cacheService.del(CACHE_KEYS.STUDENT(studentId));

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
    await validateSlotHasCapacity(student.slotId);

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
    const cacheKey = CACHE_KEYS.STUDENT(studentId);

    const result = await cacheService.getOrSet(
      cacheKey,
      async () => {
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
      },
      CACHE_TTL.STUDENT_PROFILE,
    );

    return result;
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
