import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import AnnouncementService from "../services/announcement.service.js";

export const listStudentAnnouncements = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const announcements = await AnnouncementService.listAnnouncementsForStudent(
    req.student._id,
    parseInt(limit, 10),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, announcements, "Announcements fetched"));
});
