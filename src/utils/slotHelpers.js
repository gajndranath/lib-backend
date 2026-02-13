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

  const occupiedSeats = await Student.countDocuments({
    slotId: slotId,
    status: "ACTIVE",
    isDeleted: false,
  });

  const availableSeats = slot.totalSeats - occupiedSeats;
  const isFull = occupiedSeats >= slot.totalSeats;

  return {
    slot,
    occupiedSeats,
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
  const slots = await Slot.find({ isActive: true }).lean();

  const slotsWithOccupancy = await Promise.all(
    slots.map(async (slot) => {
      const occupiedSeats = await Student.countDocuments({
        slotId: slot._id,
        status: "ACTIVE",
        isDeleted: false,
      });

      return {
        ...slot,
        occupiedSeats,
        availableSeats: slot.totalSeats - occupiedSeats,
        occupancyPercentage: Math.round(
          (occupiedSeats / slot.totalSeats) * 100,
        ),
        isFull: occupiedSeats >= slot.totalSeats,
      };
    }),
  );

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
