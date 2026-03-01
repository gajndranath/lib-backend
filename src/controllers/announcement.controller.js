import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import AnnouncementService from "../services/announcement.service.js";
import NotificationService from "../services/notification.service.js";
import { Announcement } from "../models/announcement.model.js";
import { getIO } from "../sockets/index.js";

export const createAnnouncement = asyncHandler(async (req, res) => {
  const {
    targetScope,
    slotId,
    roomId,
    recipientIds,
    recipientCiphertexts,
    title,
    body,
  } = req.body;

  if (!targetScope) throw new ApiError(400, "targetScope is required");
  if (!body) throw new ApiError(400, "body is required");

  const tenantId = req.tenantId || req.admin.tenantId;

  // Resolve recipient IDs based on scope
  const resolvedRecipientIds = await AnnouncementService.resolveRecipients({
    targetScope,
    slotId,
    roomId,
    recipientIds,
    tenantId,
  });

  if (resolvedRecipientIds.length === 0) {
    throw new ApiError(400, "No recipients found for this announcement");
  }

  const announcement = await AnnouncementService.createAnnouncement({
    adminId: req.admin._id,
    targetScope,
    slotId,
    roomId,
    recipientIds: resolvedRecipientIds.map((r) => r._id || r),
    recipientCiphertexts: recipientCiphertexts || [],
    title,
    body,
    tenantId: req.tenantId || req.admin.tenantId,
  });

  try {
    const io = getIO();
    if (io) {
      // Room-based broadcasting for efficiency
      if (targetScope === "ALL_STUDENTS") {
        io.to("students_all").emit("announcement:new", {
          announcementId: announcement._id,
          title: announcement.title
        });
      } else if (targetScope === "SLOT" && slotId) {
        io.to(`student_slot_${slotId}`).emit("announcement:new", {
          announcementId: announcement._id,
          title: announcement.title
        });
      } else if (targetScope === "ROOM" && roomId) {
        io.to(`student_room_${roomId}`).emit("announcement:new", {
          announcementId: announcement._id,
          title: announcement.title
        });
      } else {
        // Specific students fall back to individual rooms
        announcement.recipientIds.forEach((recipientId) => {
          io.to(`student_${recipientId}`).emit("announcement:new", {
            announcementId: announcement._id,
            title: announcement.title
          });
        });
      }
    }

    // Optimized Push Broadcasting
    let recipientTokens = [];
    const Student = (await import("../models/student.model.js")).Student;
    
    if (targetScope === "ALL_STUDENTS") {
        const students = await Student.find({ tenantId: announcement.tenantId, status: "ACTIVE", isDeleted: false, fcmToken: { $exists: true, $ne: null } }).select("fcmToken");
        recipientTokens = students.map(s => s.fcmToken);
    } else if (targetScope === "SLOT" && slotId) {
        const students = await Student.find({ tenantId: announcement.tenantId, status: "ACTIVE", isDeleted: false, slotId, fcmToken: { $exists: true, $ne: null } }).select("fcmToken");
        recipientTokens = students.map(s => s.fcmToken);
    } else if (targetScope === "ROOM" && roomId) {
        const Slot = (await import("../models/slot.model.js")).Slot;
        const slots = await Slot.find({ roomId, tenantId: announcement.tenantId }).select("_id");
        const slotIds = slots.map(s => s._id);
        const students = await Student.find({ tenantId: announcement.tenantId, status: "ACTIVE", isDeleted: false, slotId: { $in: slotIds }, fcmToken: { $exists: true, $ne: null } }).select("fcmToken");
        recipientTokens = students.map(s => s.fcmToken);
    } else {
        // Specific students
        const students = await Student.find({ _id: { $in: announcement.recipientIds }, fcmToken: { $exists: true, $ne: null } }).select("fcmToken");
        recipientTokens = students.map(s => s.fcmToken);
    }

    if (recipientTokens.length > 0) {
        await NotificationService.broadcastFCMPush(
            recipientTokens,
            announcement.title,
            "New Signal Received",
            { type: "ANNOUNCEMENT", announcementId: announcement._id.toString() }
        ).catch(err => console.error("Batch push failed:", err));
    }
  } catch (error) {
    console.error("Announcement communication error:", error);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, announcement, "Announcement created"));
});

export const resolveRecipients = asyncHandler(async (req, res) => {
  const { targetScope, slotId, roomId, recipientIds } = req.body;
  const recipients = await AnnouncementService.resolveRecipients({
    targetScope,
    slotId,
    roomId,
    recipientIds,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, recipients, "Recipients resolved"));
});

export const listAnnouncements = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.admin.tenantId;
  const totalInDB = await Announcement.countDocuments();
  
  const announcements = await Announcement.find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("createdBy", "name")
    .populate("slotId", "name")
    .populate("roomId", "name");

  return res
    .status(200)
    .json(new ApiResponse(200, announcements, "Announcements retrieved"));
});
