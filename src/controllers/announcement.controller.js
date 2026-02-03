import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import AnnouncementService from "../services/announcement.service.js";
import NotificationService from "../services/notification.service.js";

export const createAnnouncement = asyncHandler(async (req, res) => {
  const { targetScope, slotId, recipientIds, title, body } = req.body;

  if (!targetScope) throw new ApiError(400, "targetScope is required");
  if (!title) throw new ApiError(400, "title is required");
  if (!body) throw new ApiError(400, "body is required");

  // Resolve recipient IDs based on scope
  const resolvedRecipientIds = await AnnouncementService.resolveRecipients({
    targetScope,
    slotId,
    recipientIds,
  });

  if (resolvedRecipientIds.length === 0) {
    throw new ApiError(400, "No recipients found for this announcement");
  }

  const announcement = await AnnouncementService.createAnnouncement({
    adminId: req.admin._id,
    targetScope,
    slotId,
    recipientIds: resolvedRecipientIds.map((r) => r._id || r),
    title,
    body,
  });

  try {
    const io = global.io;
    if (io) {
      // Notify all recipients
      announcement.recipientIds.forEach((recipientId) => {
        io.to(`student_${recipientId}`).emit("announcement:new", {
          announcementId: announcement._id,
          recipientId,
        });
      });
    }

    await Promise.all(
      announcement.recipientIds.map((recipientId) =>
        NotificationService.sendAnnouncementNotification({
          studentId: recipientId,
          title: "New announcement",
        }),
      ),
    );
  } catch (error) {
    console.error("Announcement notification error:", error);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, announcement, "Announcement created"));
});

export const resolveRecipients = asyncHandler(async (req, res) => {
  const { targetScope, slotId, recipientIds } = req.body;
  const recipients = await AnnouncementService.resolveRecipients({
    targetScope,
    slotId,
    recipientIds,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, recipients, "Recipients resolved"));
});
