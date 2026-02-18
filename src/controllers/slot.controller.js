import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import SlotService from "../services/slot.service.js";

export const createSlot = asyncHandler(async (req, res) => {
  const slotData = req.body;

  const slot = await SlotService.createSlot(slotData, req.admin._id);

  // Convert to plain object and strip MongoDB properties
  const slotObj = slot.toObject ? slot.toObject() : slot;

  // Remove any circular references
  const cleanSlot = JSON.parse(JSON.stringify(slotObj));

  return res
    .status(201)
    .json(new ApiResponse(201, slot, "Slot created successfully"));
});

export const updateSlot = asyncHandler(async (req, res) => {
  const { slotId } = req.params;
  const updateData = req.body;

  const slot = await SlotService.updateSlot(slotId, updateData, req.admin._id);

  return res
    .status(200)
    .json(new ApiResponse(200, slot, "Slot updated successfully"));
});

export const getSlotDetails = asyncHandler(async (req, res) => {
  const { slotId } = req.params;

  const slotDetails = await SlotService.getSlotWithDetails(slotId);

  return res
    .status(200)
    .json(new ApiResponse(200, slotDetails, "Slot details fetched"));
});

export const getAllSlots = asyncHandler(async (req, res) => {
  const slots = await SlotService.getAllSlotsWithOccupancy();

  return res.status(200).json(new ApiResponse(200, slots, "All slots fetched"));
});

export const deleteSlot = asyncHandler(async (req, res) => {
  const { slotId } = req.params;
  const { reason } = req.body;

  // Soft delete by marking as inactive
  const slot = await SlotService.updateSlot(
    slotId,
    { isActive: false },
    req.admin._id,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, slot, "Slot deactivated successfully"));
});
