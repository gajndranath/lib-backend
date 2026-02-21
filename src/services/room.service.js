import { Room } from "../models/room.model.js";
import { ApiError } from "../utils/ApiError.js";

class RoomService {
  /**
   * Create a new room
   */
  async createRoom(roomData, adminId) {
    const { name, totalSeats, description, tenantId } = roomData;

    if (!tenantId) {
      throw new ApiError(400, "Tenant ID is required");
    }

    const existingRoom = await Room.findOne({ tenantId, name });
    if (existingRoom) {
      throw new ApiError(400, "A room with this name already exists in this library");
    }

    const room = await Room.create({
      name,
      totalSeats,
      description,
      tenantId,
      createdBy: adminId,
    });

    return room;
  }

  /**
   * Get all rooms for a tenant
   */
  async getAllRooms(tenantId) {
    return await Room.find({ tenantId, isActive: true }).sort({ name: 1 });
  }

  /**
   * Get room by ID
   */
  async getRoomById(roomId) {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new ApiError(404, "Room not found");
    }
    return room;
  }

  /**
   * Update room details
   */
  async updateRoom(roomId, updateData) {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new ApiError(404, "Room not found");
    }

    // If updating totalSeats, ensure it's not less than 1
    if (updateData.totalSeats !== undefined && updateData.totalSeats < 1) {
      throw new ApiError(400, "Total seats must be at least 1");
    }

    // Note: In the future, we will add validation to prevent reducing seats 
    // if active students are assigned to the seats that are being removed.

    Object.assign(room, updateData);
    await room.save();

    return room;
  }

  /**
   * Soft delete room
   */
  async deleteRoom(roomId) {
    const room = await Room.findByIdAndUpdate(
      roomId,
      { isActive: false },
      { new: true }
    );
    if (!room) {
      throw new ApiError(404, "Room not found");
    }
    return room;
  }
}

export default new RoomService();
