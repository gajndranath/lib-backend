import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import RoomService from "../services/room.service.js";

export const createRoom = asyncHandler(async (req, res) => {
  const roomData = {
    ...req.body,
    tenantId: req.admin.tenantId,
  };

  const room = await RoomService.createRoom(roomData, req.admin._id);

  return res
    .status(201)
    .json(new ApiResponse(201, room, "Room created successfully"));
});

export const getAllRooms = asyncHandler(async (req, res) => {
  const rooms = await RoomService.getAllRooms(req.admin.tenantId);

  return res
    .status(200)
    .json(new ApiResponse(200, rooms, "Rooms fetched successfully"));
});

export const getRoomById = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const room = await RoomService.getRoomById(roomId);

  return res
    .status(200)
    .json(new ApiResponse(200, room, "Room details fetched"));
});

export const updateRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const room = await RoomService.updateRoom(roomId, req.body);

  return res
    .status(200)
    .json(new ApiResponse(200, room, "Room updated successfully"));
});

export const deleteRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  await RoomService.deleteRoom(roomId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Room deleted successfully"));
});
