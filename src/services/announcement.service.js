import { Announcement } from "../models/announcement.model.js";
import { Student } from "../models/student.model.js";
import { ApiError } from "../utils/ApiError.js";

class AnnouncementService {
  static async createAnnouncement({
    adminId,
    targetScope,
    slotId,
    recipientIds,
    title,
    body,
  }) {
    if (!title || !body) {
      throw new ApiError(400, "Title and body are required");
    }

    return Announcement.create({
      createdBy: adminId,
      targetScope,
      slotId: slotId || undefined,
      recipientIds: recipientIds || [],
      title,
      body,
    });
  }

  static async listAnnouncementsForStudent(studentId, limit = 50) {
    const student = await Student.findById(studentId).select("slotId");

    return Announcement.find({
      $or: [
        // All students announcements
        { targetScope: "ALL_STUDENTS" },
        // Announcements for this student's slot
        { targetScope: "SLOT", slotId: student?.slotId },
        // Specific student announcements
        { targetScope: "SPECIFIC_STUDENTS", recipientIds: studentId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  static async resolveRecipients({ targetScope, slotId, recipientIds }) {
    if (targetScope === "ALL_STUDENTS") {
      return Student.find({ status: "ACTIVE", isDeleted: false })
        .select("_id")
        .lean();
    }

    if (targetScope === "SLOT") {
      if (!slotId) throw new ApiError(400, "slotId is required");
      return Student.find({
        status: "ACTIVE",
        isDeleted: false,
        slotId,
      })
        .select("_id")
        .lean();
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
