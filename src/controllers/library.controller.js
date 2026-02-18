import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Library } from "../models/library.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";

// Get Library Profile (Current Tenant)
export const getLibraryProfile = asyncHandler(async (req, res) => {
  // reliable way to get tenantId is from the authenticated admin
  const tenantId = req.admin.tenantId;
  console.log("DEBUG: getLibraryProfile tenantId:", tenantId);

  const library = await Library.findById(tenantId).select("-ownerAdminId");

  if (!library) {
    throw new ApiError(404, "Library profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, library, "Library profile fetched successfully"));
});

// Update Library Profile
export const updateLibraryProfile = asyncHandler(async (req, res) => {
  const tenantId = req.admin.tenantId;
  const updateData = req.body;

  // Prevent updating restricted fields
  delete updateData.plan;
  delete updateData.ownerAdminId;
  delete updateData.slug; // Changing slug is complex, disallowed for now

  // Separate nested settings updates if provided flat (optional DX improvement)
  if (updateData.gracePeriodDays !== undefined) {
    updateData["settings.gracePeriodDays"] = updateData.gracePeriodDays;
    delete updateData.gracePeriodDays;
  }
  if (updateData.lateFeePerDay !== undefined) {
    updateData["settings.lateFeePerDay"] = updateData.lateFeePerDay;
    delete updateData.lateFeePerDay;
  }

  const library = await Library.findByIdAndUpdate(
    tenantId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select("-ownerAdminId");

  if (!library) {
    throw new ApiError(404, "Library profile not found");
  }

  // Log action
  await AdminActionLog.create({
    adminId: req.admin._id,
    action: "UPDATE_LIBRARY_SETTINGS",
    targetEntity: "LIBRARY",
    targetId: library._id,
    newValue: updateData,
    tenantId: library._id // Self-referential for library logs
  });

  return res
    .status(200)
    .json(new ApiResponse(200, library, "Library settings updated successfully"));
});
