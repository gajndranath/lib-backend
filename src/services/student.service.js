import { Student } from "../models/student.model.js";
import { Friendship } from "../models/friendship.model.js";
import { Library } from "../models/library.model.js";
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
  static async registerStudent(studentData, adminId, tenantId) {
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

      // ENV-based email verification logic
      let emailVerified = false;
      if (process.env.NODE_ENV === "development") {
        emailVerified = true;
        // Optionally log skipping OTP/email verification
        console.log(
          "[DEV] Skipping email OTP verification, setting emailVerified: true",
        );
      }

      // ✅ Create student
      const student = await Student.create({
        ...studentData,
        libraryId,
        createdBy: adminId,
        tenantId,
        emailVerified,
      });

      // ✅ Monthly fee record generation moved to ensureMonthlyFeeExists loop
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

    // Store old values for logging
    const oldValues = {
      name: student.name,
      phone: student.phone,
      email: student.email,
      address: student.address,
      fatherName: student.fatherName,
      monthlyFee: student.monthlyFee,
      status: student.status,
      emailVerified: student.emailVerified,
      phoneVerified: student.phoneVerified,
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

    // Update student fields
    // Explicitly handle fields often sent from admin dashboard
    const updatableFields = [
      "name",
      "phone",
      "email",
      "address",
      "fatherName",
      "slotId",
      "monthlyFee",
      "status",
      "emailVerified",
      "phoneVerified",
      "seatNumber",
      "joiningDate",
      "notes",
      "tags",
    ];

    updatableFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        student[field] = updateData[field];
      }
    });

    await student.save();

    // If joiningDate was changed, trigger a catch-up for fees immediately
    if (updateData.joiningDate !== undefined) {
      try {
        const FeeGenerationService = (await import("./feeGeneration.service.js")).default;
        // Triggering personalized fee generation logic will catch any months 
        // between the new joining date and today.
        await FeeGenerationService.generatePersonalizedFees(adminId, student._id);
        console.log(`✅ Billing cycle synced for student ${student.libraryId}`);
      } catch (feeError) {
        console.error("❌ Failed to sync billing cycle:", feeError.message);
      }
    }

    // Invalidate student cache
    await cacheService.del(CACHE_KEYS.STUDENT(studentId));

    // Reload the student from DB to return the final state after all hooks and services
    const updatedStudent = await Student.findById(studentId);

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

    return updatedStudent;
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

    // Invalidate student cache
    await cacheService.del(CACHE_KEYS.STUDENT(studentId));

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
        const student = await Student.findById(studentId).populate({
          path: "slotId",
          select: "name timeRange monthlyFee roomId",
          populate: {
            path: "roomId",
            select: "name"
          }
        });

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
    // 1. Soft-delete logic: Include isDeleted if specifically ARCHIVED or if includeArchived flag is set
    const filter = { 
      isDeleted: query.status === "ARCHIVED" || query.includeArchived === "true" || query.includeArchived === true 
    };

    const criteria = [];

    // 2. Multi-tenancy logic: Lenient filter to support legacy records missing tenantId
    if (query.tenantId) {
      criteria.push({
        $or: [
          { tenantId: query.tenantId },
          { tenantId: { $exists: false } }
        ]
      });
    }

    // 3. Search Filter
    if (query.search) {
      const searchRegex = new RegExp(query.search, "i");
      criteria.push({
        $or: [
          { name: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
          { fatherName: searchRegex },
        ]
      });
    }

    if (criteria.length > 0) {
      filter.$and = criteria;
    }

    // 4. Status and Slot Filters
    if (query.status && query.status !== "ALL") {
      filter.status = query.status;
    }

    if (query.slotId) {
      filter.slotId = query.slotId;
    }

    // Execute query
    const [studentsRaw, total] = await Promise.all([
      Student.find(filter)
        .populate({
          path: "slotId",
          select: "name roomId",
          populate: {
            path: "roomId",
            select: "name"
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    // Attach fee summary for each student in the current page
    const students = await Promise.all(
      studentsRaw.map(async (student) => {
        try {
          const summary = await FeeService.getStudentFeeSummary(student._id);
          return {
            ...student,
            totalDue: summary?.totals?.totalDue || 0,
            totalPaid: summary?.totals?.totalPaid || 0,
          };
        } catch (error) {
          console.error(`[WARN] Failed to fetch fee summary for student ${student._id}:`, error.message);
          return {
            ...student,
            totalDue: 0,
            totalPaid: 0,
          };
        }
      }),
    );

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
      .populate({
        path: "slotId",
        select: "name timeRange roomId",
        populate: {
          path: "roomId",
          select: "name"
        }
      })
      .sort({ name: 1 })
      .lean();

    return students;
  }

  /**
   * Override a student's monthly fee (SUPER_ADMIN only)
   * Moved from SlotService — this is a student domain operation.
   */
  static async overrideStudentFee(studentId, newMonthlyFee, reason, adminId) {
    const student = await Student.findById(studentId);
    if (!student) throw new ApiError(404, "Student not found");

    const oldValue = {
      monthlyFee: student.monthlyFee,
      feeOverride: student.feeOverride,
    };

    student.monthlyFee = newMonthlyFee;
    student.feeOverride = true;
    student.notes = student.notes
      ? `${student.notes}\nFee overridden on ${new Date().toISOString()}: ${reason}`
      : `Fee overridden: ${reason}`;

    await student.save();

    // Invalidate student cache
    await cacheService.del(CACHE_KEYS.STUDENT(studentId));
    await cacheService.del(CACHE_KEYS.STUDENT_FEES(studentId));

    await AdminActionLog.create({
      adminId,
      action: "OVERRIDE_FEE",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue,
      newValue: { monthlyFee: newMonthlyFee, feeOverride: true, reason },
      metadata: { studentId: student._id },
    });

    return student;
  }

  /**
   * Search peers for Social Hub
   * - Respects privacySettings.showInSearch
   * - Filters by slot, room, name
   * - Returns only public fields
   */
  static async searchPeers(studentId, query, tenantId, enforcedSlotId = null) {
    const { search, slotId, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {
      _id: { $ne: studentId }, // Exclude self
      tenantId,
      status: "ACTIVE",
      isDeleted: false,
      "privacySettings.showInSearch": { $ne: false },
    };

    // If enforcedSlotId is provided (e.g. for student-only same-slot rule), use it
    if (enforcedSlotId) {
      filter.slotId = enforcedSlotId;
    } else if (slotId) {
      // Otherwise allow manual slot filtering (e.g. for Admin if they ever use this)
      filter.slotId = slotId;
    }

    if (criteria.length > 0) {
      filter.$and = criteria;
    }

    const [students, total] = await Promise.all([
      Student.find(filter)
        .select("name libraryId slotId seatNumber joiningDate privacySettings")
        .populate({
          path: "slotId",
          select: "name roomId",
          populate: { path: "roomId", select: "name" },
        })
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Student.countDocuments(filter),
    ]);

    return {
      students: students.map((s) => ({
        ...s,
        slotName: s.privacySettings?.showSlot !== false ? s.slotId?.name : "Hidden",
        roomName: s.privacySettings?.showSlot !== false ? s.slotId?.roomId?.name : "Hidden",
        slotId: s.privacySettings?.showSlot !== false ? s.slotId?._id : null,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }
}

export default StudentService;
