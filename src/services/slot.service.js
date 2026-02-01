import { Slot } from "../models/slot.model.js";
import { Student } from "../models/student.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
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
          `Cannot reduce seats below ${occupiedSeats} occupied seats`
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
          (activeStudents.length / slot.totalSeats) * 100
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
            (occupiedSeats / slot.totalSeats) * 100
          ),
        };
      })
    );

    return slotsWithOccupancy;
  }

  /**
   * Change student's slot
   */
  static async changeStudentSlot(studentId, newSlotId, adminId) {
    const student = await Student.findById(studentId);
    const newSlot = await Slot.findById(newSlotId);

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    if (!newSlot) {
      throw new ApiError(404, "New slot not found");
    }

    // Store old values
    const oldValues = {
      slotId: student.slotId,
      slotName: (await Slot.findById(student.slotId))?.name,
    };

    // Check if new slot has available seats
    const occupiedSeats = await Student.countDocuments({
      slotId: newSlotId,
      status: "ACTIVE",
    });

    if (occupiedSeats >= newSlot.totalSeats) {
      throw new ApiError(400, `Slot "${newSlot.name}" is full`);
    }

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
