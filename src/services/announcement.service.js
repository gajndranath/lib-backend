import { Announcement } from "../models/announcement.model.js";
import { Student } from "../models/student.model.js";
import { ApiError } from "../utils/ApiError.js";
import { StudentStatus } from "../constants/constants.js";
import mongoose from "mongoose";

class AnnouncementService {
  static async createAnnouncement({
    adminId,
    targetScope,
    slotId,
    roomId,
    recipientIds,
    recipientCiphertexts,
    title,
    body,
    tenantId,
  }) {
    if (!title || !body) {
      throw new ApiError(400, "Title and body are required");
    }

    return Announcement.create({
      createdBy: adminId,
      targetScope,
      slotId: slotId || undefined,
      roomId: roomId || undefined,
      recipientIds: recipientIds || [],
      recipientCiphertexts: recipientCiphertexts || [],
      title,
      body,
      tenantId,
    });
  }

  static async listAnnouncementsForStudent(studentId, limit = 50) {
    const Slot = (await import("../models/slot.model.js")).Slot;
    const student = await Student.findById(studentId).select("slotId tenantId");
    
    let roomId = null;
    if (student?.slotId) {
        const slot = await Slot.findById(student.slotId).select("roomId");
        roomId = slot?.roomId;
    }

    const announcements = await Announcement.find({
      tenantId: student?.tenantId,
      $or: [
        // All students announcements
        { targetScope: "ALL_STUDENTS" },
        // Announcements for this student's slot
        { targetScope: "SLOT", slotId: student?.slotId },
        // Announcements for this student's room
        { targetScope: "ROOM", roomId },
        // Specific student announcements
        { targetScope: "SPECIFIC_STUDENTS", recipientIds: studentId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return announcements;
  }

  static async resolveRecipients({ targetScope, slotId, roomId, recipientIds, tenantId }) {
    // Shared filter logic
    const tId = tenantId ? (typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId) : null;
    
    const baseFilter = { 
        status: StudentStatus.ACTIVE, 
        isDeleted: false,
        $or: [
            { tenantId: tId },
            { tenantId: { $exists: false } },
            { tenantId: null }
        ]
    };

    if (targetScope === "ALL_STUDENTS") {
      const students = await Student.find(baseFilter).select("_id").lean();
      return students;
    }

    if (targetScope === "SLOT") {
      if (!slotId) throw new ApiError(400, "slotId is required");
      const students = await Student.find({
        ...baseFilter,
        slotId,
      }).select("_id").lean();
      return students;
    }

    if (targetScope === "ROOM") {
      if (!roomId) throw new ApiError(400, "roomId is required");
      const Slot = (await import("../models/slot.model.js")).Slot;
      const slots = await Slot.find({ roomId, tenantId }).select("_id");
      const slotIds = slots.map(s => s._id);
      
      const students = await Student.find({
        ...baseFilter,
        slotId: { $in: slotIds },
      }).select("_id").lean();
      return students;
    }

    if (targetScope === "SPECIFIC_STUDENTS") {
      if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        throw new ApiError(400, "recipientIds are required");
      }
      return recipientIds.map((id) => ({ _id: id }));
    }

    throw new ApiError(400, "Invalid targetScope");
  }
}

export default AnnouncementService;
