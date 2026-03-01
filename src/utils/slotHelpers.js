/**
 * Slot Management Utilities
 * Centralized slot capacity checks and validations
 */

import { Slot } from "../models/slot.model.js";
import { Student } from "../models/student.model.js";
import { ApiError } from "./ApiError.js";

/**
 * Check if a slot has available capacity
 * @param {string} slotId - MongoDB ObjectId of the slot
 * @returns {Promise<Object>} { slot, occupiedSeats, availableSeats, isFull }
 * @throws {ApiError} If slot not found
 */
export const checkSlotCapacity = async (slotId) => {
  const slot = await Slot.findById(slotId);

  if (!slot) {
    throw new ApiError(404, "Slot not found");
  }

  if (!slot.isActive) {
    throw new ApiError(400, "Slot is not active");
  }

  // 1. Density in THIS specific slot
  const slotSpecificOccupancy = await Student.countDocuments({
    slotId: slotId,
    status: "ACTIVE",
    isDeleted: false,
  });

  // 2. Additional density from FULL_DAY overlapping students (if this is a PARTIAL slot)
  let overlappingOccupancy = 0;
  if (slot.slotType === "PARTIAL") {
    const fullDaySlots = await Slot.find({
      roomId: slot.roomId,
      slotType: "FULL_DAY",
      isActive: true,
      _id: { $ne: slotId }
    }).select("_id");

    if (fullDaySlots.length > 0) {
      overlappingOccupancy = await Student.countDocuments({
        slotId: { $in: fullDaySlots.map(s => s._id) },
        status: "ACTIVE",
        isDeleted: false
      });
    }
  }

  const occupiedSeats = slotSpecificOccupancy + overlappingOccupancy;
  const availableSeats = slot.totalSeats - occupiedSeats;
  const isFull = occupiedSeats >= slot.totalSeats;

  return {
    slot,
    slotSpecificOccupancy,
    overlappingOccupancy,
    occupiedSeats, // Total Collective Density
    availableSeats,
    isFull,
    occupancyPercentage: Math.round((occupiedSeats / slot.totalSeats) * 100),
  };
};

/**
 * Validate slot has capacity for new student
 * @param {string} slotId - MongoDB ObjectId of the slot
 * @throws {ApiError} If slot is full or not found
 */
export const validateSlotHasCapacity = async (slotId) => {
  const { slot, occupiedSeats, isFull } = await checkSlotCapacity(slotId);

  if (isFull) {
    throw new ApiError(
      400,
      `Slot "${slot.name}" is full (${occupiedSeats}/${slot.totalSeats}). Please select another slot.`,
    );
  }

  return { slot, occupiedSeats };
};

/**
 * Validate slot change is possible
 * @param {string} currentSlotId - Current slot ID
 * @param {string} newSlotId - New slot ID
 * @throws {ApiError} If trying to move to same slot
 */
export const validateSlotChange = (currentSlotId, newSlotId) => {
  if (currentSlotId.toString() === newSlotId.toString()) {
    throw new ApiError(400, "Student is already in this slot");
  }
};

/**
 * Get all slots with occupancy details
 * @returns {Promise<Array>} Array of slots with occupancy info
 */
export const getAllSlotsWithOccupancy = async () => {
  const slots = await Slot.find().populate("roomId", "name").lean();

  // 1. Pre-calculate occupancy map for all slots
  const occupancyMap = {};
  const allActiveStudents = await Student.find({ status: "ACTIVE", isDeleted: false }).select("slotId");
  
  allActiveStudents.forEach(s => {
    const sId = s.slotId.toString();
    occupancyMap[sId] = (occupancyMap[sId] || 0) + 1;
  });

  // 2. Identify FULL_DAY slots per room for collective calculations
  const roomFullDayStudents = {};
  slots.forEach(slot => {
    if (slot.slotType === 'FULL_DAY') {
      const rId = slot.roomId?._id?.toString() || slot.roomId?.toString();
      roomFullDayStudents[rId] = (roomFullDayStudents[rId] || 0) + (occupancyMap[slot._id.toString()] || 0);
    }
  });

  const slotsWithOccupancy = slots.map((slot) => {
    const slotIdStr = slot._id.toString();
    const roomIdStr = slot.roomId?._id?.toString() || slot.roomId?.toString();
    
    // Collective count: students in this slot + students in FULL_DAY slots for this room
    let occupiedSeats = occupancyMap[slotIdStr] || 0;
    
    if (slot.slotType === "PARTIAL" && roomFullDayStudents[roomIdStr]) {
      occupiedSeats += roomFullDayStudents[roomIdStr];
    }

    return {
      ...slot,
      occupiedSeats,
      availableSeats: Math.max(0, slot.totalSeats - occupiedSeats),
      occupancyPercentage: Math.round((occupiedSeats / slot.totalSeats) * 100),
      isFull: occupiedSeats >= slot.totalSeats,
    };
  });

  return slotsWithOccupancy;
};

/**
 * Validate reducing slot capacity
 * @param {string} slotId - Slot ID
 * @param {number} newTotalSeats - New total seats
 * @throws {ApiError} If reduction would exceed current occupancy
 */
export const validateSlotSeatReduction = async (slotId, newTotalSeats) => {
  const { occupiedSeats } = await checkSlotCapacity(slotId);

  if (occupiedSeats > newTotalSeats) {
    throw new ApiError(
      400,
      `Cannot reduce seats below ${occupiedSeats} occupied seats`,
    );
  }
};
