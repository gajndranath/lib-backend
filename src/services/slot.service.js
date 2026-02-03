import { Slot } from "../models/slot.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { SlotChangeHistory } from "../models/slotChangeHistory.model.js";
import { ApiError } from "../utils/ApiError.js";

class SlotService {
  /**
   * Create new slot
   */
  static async createSlot(slotData, adminId) {
    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (
      !timeRegex.test(slotData.timeRange.start) ||
      !timeRegex.test(slotData.timeRange.end)
    ) {
      throw new ApiError(400, "Invalid time format. Use HH:MM format.");
    }

    const slot = await Slot.create({
      ...slotData,
      createdBy: adminId,
    });

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "CREATE_SLOT",
      targetEntity: "SLOT",
      targetId: slot._id,
      newValue: slotData,
      metadata: { slotId: slot._id },
    });

    // Convert to plain object and return only necessary fields
    const slotObj = slot.toObject();

    // Return a clean object without circular references
    return {
      _id: slotObj._id,
      name: slotObj.name,
      timeRange: slotObj.timeRange,
      monthlyFee: slotObj.monthlyFee,
      totalSeats: slotObj.totalSeats,
      isActive: slotObj.isActive,
      createdBy: slotObj.createdBy,
      createdAt: slotObj.createdAt,
      updatedAt: slotObj.updatedAt,
      __v: slotObj.__v,
    };
  }

  /**
   * Update slot
   */
  static async updateSlot(slotId, updateData, adminId) {
    const slot = await Slot.findById(slotId);

    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    // Store old values for audit
    const oldValues = {
      name: slot.name,
      timeRange: slot.timeRange,
      monthlyFee: slot.monthlyFee,
      totalSeats: slot.totalSeats,
      isActive: slot.isActive,
    };

    // If reducing total seats, check if it's feasible
    if (updateData.totalSeats && updateData.totalSeats < slot.totalSeats) {
      const occupiedSeats = await Student.countDocuments({
        slotId: slot._id,
        status: "ACTIVE",
      });

      if (occupiedSeats > updateData.totalSeats) {
        throw new ApiError(
          400,
          `Cannot reduce seats below ${occupiedSeats} occupied seats`,
        );
      }
    }

    // Update slot
    Object.assign(slot, updateData);
    await slot.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "UPDATE_SLOT",
      targetEntity: "SLOT",
      targetId: slot._id,
      oldValue: oldValues,
      newValue: updateData,
      metadata: { slotId: slot._id },
    });

    return slot;
  }

  /**
   * Get slot with occupancy details
   */
  static async getSlotWithDetails(slotId) {
    const slot = await Slot.findById(slotId);

    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    const activeStudents = await Student.find({
      slotId: slot._id,
      status: "ACTIVE",
    }).select("name phone seatNumber joiningDate");

    return {
      slot: slot.toObject(),
      occupancy: {
        totalSeats: slot.totalSeats,
        occupiedSeats: activeStudents.length,
        availableSeats: slot.totalSeats - activeStudents.length,
        occupancyPercentage: Math.round(
          (activeStudents.length / slot.totalSeats) * 100,
        ),
      },
      students: activeStudents,
    };
  }

  /**
   * Get all slots with occupancy
   */
  static async getAllSlotsWithOccupancy() {
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
            (occupiedSeats / slot.totalSeats) * 100,
          ),
        };
      }),
    );

    return slotsWithOccupancy;
  }

  /**
   * Change student's slot (Admin initiated)
   */
  static async changeStudentSlot(studentId, newSlotId, adminId, reason = "") {
    const student = await Student.findById(studentId).populate("slotId");
    const newSlot = await Slot.findById(newSlotId);
    const oldSlot = student.slotId;

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (!newSlot) {
      throw new ApiError(404, "New slot not found");
    }

    // Check if student is trying to move to same slot
    if (oldSlot._id.toString() === newSlotId) {
      throw new ApiError(400, "Student is already in this slot");
    }

    // Check if new slot has available seats
    const occupiedSeats = await Student.countDocuments({
      slotId: newSlotId,
      status: "ACTIVE",
    });

    if (occupiedSeats >= newSlot.totalSeats) {
      throw new ApiError(400, `Slot "${newSlot.name}" is full`);
    }

    // Store old values
    const oldValues = {
      slotId: oldSlot._id,
      slotName: oldSlot.name,
    };

    // Update student
    student.slotId = newSlotId;
    await student.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "CHANGE_SLOT",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue: oldValues,
      newValue: {
        slotId: newSlotId,
        slotName: newSlot.name,
      },
      metadata: { studentId: student._id },
    });

    // Create slot change history record
    await SlotChangeHistory.create({
      studentId: student._id,
      previousSlotId: oldSlot._id,
      previousSlotName: oldSlot.name,
      newSlotId: newSlot._id,
      newSlotName: newSlot.name,
      changeType: "ADMIN_INITIATED",
      changedBy: adminId,
      changedByRole: "ADMIN",
      reason,
      metadata: {
        previousTimeRange: oldSlot.timeRange,
        newTimeRange: newSlot.timeRange,
        previousMonthlyFee: student.monthlyFee,
        newMonthlyFee: newSlot.monthlyFee,
      },
    });

    return {
      student,
      oldSlot: oldValues,
      newSlot: {
        id: newSlot._id,
        name: newSlot.name,
      },
    };
  }

  /**
   * Request slot change by student
   */
  static async requestSlotChange(studentId, newSlotId, reason = "") {
    const student = await Student.findById(studentId).populate("slotId");
    const newSlot = await Slot.findById(newSlotId);
    const oldSlot = student.slotId;

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (!newSlot) {
      throw new ApiError(404, "New slot not found");
    }

    // Check if student is trying to move to same slot
    if (oldSlot._id.toString() === newSlotId) {
      throw new ApiError(400, "Student is already in this slot");
    }

    // Check if new slot has available seats
    const occupiedSeats = await Student.countDocuments({
      slotId: newSlotId,
      status: "ACTIVE",
    });

    if (occupiedSeats >= newSlot.totalSeats) {
      throw new ApiError(400, `Slot "${newSlot.name}" is full`);
    }

    // Create slot change history record (stored as pending request)
    const changeRequest = await SlotChangeHistory.create({
      studentId: student._id,
      previousSlotId: oldSlot._id,
      previousSlotName: oldSlot.name,
      newSlotId: newSlot._id,
      newSlotName: newSlot.name,
      changeType: "STUDENT_REQUESTED",
      changedBy: studentId,
      changedByRole: "STUDENT",
      reason,
      isActive: false, // Mark as pending (not yet applied)
      metadata: {
        previousTimeRange: oldSlot.timeRange,
        newTimeRange: newSlot.timeRange,
        previousMonthlyFee: student.monthlyFee,
        newMonthlyFee: newSlot.monthlyFee,
      },
    });

    return {
      message: "Slot change request submitted",
      request: changeRequest,
      currentSlot: {
        id: oldSlot._id,
        name: oldSlot.name,
      },
      requestedSlot: {
        id: newSlot._id,
        name: newSlot.name,
      },
    };
  }

  /**
   * Get student's slot change history
   */
  static async getStudentSlotHistory(studentId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const history = await SlotChangeHistory.find({ studentId })
      .populate("previousSlotId", "name timeRange monthlyFee")
      .populate("newSlotId", "name timeRange monthlyFee")
      .sort({ createdAt: -1 })
      .lean();

    return history;
  }

  /**
   * Get all pending slot change requests (for admin)
   */
  static async getPendingSlotRequests() {
    const requests = await SlotChangeHistory.find({
      changeType: "STUDENT_REQUESTED",
      isActive: false,
    })
      .populate("studentId", "name phone email")
      .populate("previousSlotId", "name timeRange monthlyFee")
      .populate("newSlotId", "name timeRange monthlyFee")
      .sort({ createdAt: 1 })
      .lean();

    return requests;
  }

  /**
   * Approve slot change request (admin action)
   */
  static async approveSlotChangeRequest(historyId, adminId) {
    const changeRecord = await SlotChangeHistory.findById(historyId);

    if (!changeRecord) {
      throw new ApiError(404, "Slot change request not found");
    }

    if (changeRecord.changeType !== "STUDENT_REQUESTED") {
      throw new ApiError(400, "This is not a student request");
    }

    if (changeRecord.isActive) {
      throw new ApiError(400, "This request has already been approved");
    }

    // Get student and new slot details
    const student = await Student.findById(changeRecord.studentId);
    const newSlot = await Slot.findById(changeRecord.newSlotId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (!newSlot) {
      throw new ApiError(404, "New slot not found");
    }

    // Verify slot still has available seats
    const occupiedSeats = await Student.countDocuments({
      slotId: changeRecord.newSlotId,
      status: "ACTIVE",
    });

    if (occupiedSeats >= newSlot.totalSeats) {
      throw new ApiError(400, `Slot "${newSlot.name}" is now full`);
    }

    // Update student's slot
    student.slotId = changeRecord.newSlotId;
    await student.save();

    // Update change record to active and mark as approved
    changeRecord.isActive = true;
    changeRecord.changeType = "STUDENT_APPROVED";
    await changeRecord.save();

    // Log the admin action
    await AdminActionLog.create({
      adminId,
      action: "APPROVE_SLOT_CHANGE",
      targetEntity: "STUDENT",
      targetId: student._id,
      newValue: {
        slotId: changeRecord.newSlotId,
        slotName: changeRecord.newSlotName,
      },
      metadata: { studentId: student._id, changeRequestId: historyId },
    });

    return {
      message: "Slot change request approved",
      student,
      oldSlot: {
        id: changeRecord.previousSlotId,
        name: changeRecord.previousSlotName,
      },
      newSlot: {
        id: changeRecord.newSlotId,
        name: changeRecord.newSlotName,
      },
    };
  }

  /**
   * Reject slot change request (admin action)
   */
  static async rejectSlotChangeRequest(historyId, adminId, reason = "") {
    const changeRecord = await SlotChangeHistory.findById(historyId);

    if (!changeRecord) {
      throw new ApiError(404, "Slot change request not found");
    }

    if (changeRecord.changeType !== "STUDENT_REQUESTED") {
      throw new ApiError(400, "This is not a student request");
    }

    if (changeRecord.isActive) {
      throw new ApiError(400, "This request has already been approved");
    }

    // Delete the change record (mark as rejected)
    await SlotChangeHistory.findByIdAndDelete(historyId);

    // Log the admin action
    await AdminActionLog.create({
      adminId,
      action: "REJECT_SLOT_CHANGE",
      targetEntity: "STUDENT",
      targetId: changeRecord.studentId,
      newValue: {
        reason,
      },
      metadata: { changeRequestId: historyId },
    });

    return {
      message: "Slot change request rejected",
    };
  }

  /**
   * Override student fee
   */
  static async overrideStudentFee(studentId, newMonthlyFee, reason, adminId) {
    const student = await Student.findById(studentId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    // Store old value
    const oldValue = {
      monthlyFee: student.monthlyFee,
      feeOverride: student.feeOverride,
    };

    // Update student
    student.monthlyFee = newMonthlyFee;
    student.feeOverride = true;
    student.notes = student.notes
      ? `${
          student.notes
        }\nFee overridden on ${new Date().toISOString()}: ${reason}`
      : `Fee overridden: ${reason}`;

    await student.save();

    // Log the action
    await AdminActionLog.create({
      adminId,
      action: "OVERRIDE_FEE",
      targetEntity: "STUDENT",
      targetId: student._id,
      oldValue: oldValue,
      newValue: {
        monthlyFee: newMonthlyFee,
        feeOverride: true,
        reason,
      },
      metadata: { studentId: student._id },
    });

    return student;
  }
}

export default SlotService;
