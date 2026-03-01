import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import { StudentBlock } from "../models/studentBlock.model.js";
import { Student } from "../models/student.model.js";
import { Friendship } from "../models/friendship.model.js";
import { getIO } from "../sockets/index.js";
import StudentService from "../services/student.service.js";
import { Library } from "../models/library.model.js";

const ensureStudent = async (studentId) => {
  const student = await Student.findById(studentId).select("_id name status slotId");
  if (!student || student.status !== "ACTIVE") {
    throw new ApiError(404, "Student not found");
  }
  return student;
};

const getBlockedIds = async (studentId) => {
  const blockedByMe = await StudentBlock.find({ blockerId: studentId })
    .select("blockedId")
    .lean();
  const blockedMe = await StudentBlock.find({ blockedId: studentId })
    .select("blockerId")
    .lean();

  return new Set([
    ...blockedByMe.map((b) => b.blockedId.toString()),
    ...blockedMe.map((b) => b.blockerId.toString()),
  ]);
};

const ensureNotBlocked = async (a, b) => {
  const blocked = await StudentBlock.findOne({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  });

  if (blocked) {
    throw new ApiError(403, "You cannot interact with this user");
  }
};

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const { recipientId } = req.body;
  const requesterId = req.student._id;

  if (!recipientId) throw new ApiError(400, "recipientId is required");
  if (recipientId.toString() === requesterId.toString()) {
    throw new ApiError(400, "Cannot add yourself");
  }

  const recipient = await ensureStudent(recipientId);
  await ensureNotBlocked(requesterId, recipientId);

  // Enforce SAME SLOT rule
  if (req.student.slotId?.toString() !== recipient.slotId?.toString()) {
    throw new ApiError(403, "You can only add students from your same slot");
  }

  const existing = await FriendRequest.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId },
    ],
  });

  if (existing?.status === "ACCEPTED") {
    return res
      .status(200)
      .json(new ApiResponse(200, existing, "Already friends"));
  }

  if (existing?.status === "PENDING") {
    return res
      .status(200)
      .json(new ApiResponse(200, existing, "Request already pending"));
  }

  const request = await FriendRequest.create({
    requesterId,
    recipientId,
  });

  // Emit real-time event to recipient
  try {
    const io = getIO();
    const requester = await Student.findById(requesterId).select("name");
    io.to(`student_${recipientId}`).emit("friend-request:new", {
      requestId: request._id,
      requesterId: requesterId,
      requesterName: requester?.name || "Student",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Failed to emit friend-request:new:", err);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Friend request sent"));
});

export const listFriendRequests = asyncHandler(async (req, res) => {
  const studentId = req.student._id;

  const blockedIds = await getBlockedIds(studentId);

  const incoming = await FriendRequest.find({
    recipientId: studentId,
    status: "PENDING",
  })
    .populate("requesterId", "_id name")
    .sort({ createdAt: -1 })
    .lean();

  const outgoing = await FriendRequest.find({
    requesterId: studentId,
    status: "PENDING",
  })
    .populate("recipientId", "_id name")
    .sort({ createdAt: -1 })
    .lean();

  const filteredIncoming = incoming.filter(
    (r) => !blockedIds.has(r.requesterId?._id?.toString()),
  );
  const filteredOutgoing = outgoing.filter(
    (r) => !blockedIds.has(r.recipientId?._id?.toString()),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { incoming: filteredIncoming, outgoing: filteredOutgoing },
        "Friend requests fetched",
      ),
    );
});

export const respondFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body;
  const studentId = req.student._id;

  if (!requestId || !action) {
    throw new ApiError(400, "requestId and action are required");
  }

  if (!["accept", "reject"].includes(action)) {
    throw new ApiError(400, "action must be accept or reject");
  }

  const request = await FriendRequest.findOne({
    _id: requestId,
    recipientId: studentId,
    status: "PENDING",
  });

  if (!request) throw new ApiError(404, "Request not found");

  request.status = action === "accept" ? "ACCEPTED" : "REJECTED";
  await request.save();

  // Create established friendship on accept
  if (action === "accept") {
    try {
      await Friendship.findOneAndUpdate(
        { 
          $or: [
            { studentA: request.requesterId, studentB: request.recipientId },
            { studentA: request.recipientId, studentB: request.requesterId }
          ]
        },
        { studentA: request.requesterId, studentB: request.recipientId },
        { upsert: true, new: true }
      );

      const io = getIO();
      const accepter = await Student.findById(studentId).select("name");
      io.to(`student_${request.requesterId}`).emit("friend-request:accepted", {
        requestId: request._id,
        acceptedBy: studentId,
        acceptedByName: accepter?.name || "Student",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("❌ Failed to finalize friendship or emit event:", err.message);
    }
  }

  return res.status(200).json(new ApiResponse(200, request, "Request updated"));
});

export const listFriends = asyncHandler(async (req, res) => {
  const studentId = req.student._id;

  const blockedIds = await getBlockedIds(studentId);

  const friends = await Friendship.find({
    $or: [{ studentA: studentId }, { studentB: studentId }],
  })
    .populate("studentA", "_id name email phone libraryId")
    .populate("studentB", "_id name email phone libraryId")
    .lean();

  const formatted = friends
    .map((f) => {
      const other = f.studentA?._id?.toString() === studentId.toString() ? f.studentB : f.studentA;
      return {
        _id: other?._id,
        name: other?.name,
        email: other?.email,
        phone: other?.phone,
        libraryId: other?.libraryId,
        bondedAt: f.bondedAt,
        friendshipId: f._id,
        userType: "Student",
      };
    })
    .filter((f) => f._id && !blockedIds.has(f._id.toString()));

  // ✅ Prepend Library Admin as a default connection
  try {
    const tenantId = req.tenantId || req.student?.tenantId;
    if (tenantId) {
      const library = await Library.findById(tenantId).populate({
        path: "ownerAdminId",
        select: "_id username email phone"
      });

      const admin = library?.ownerAdminId;
      if (admin) {
        formatted.unshift({
          _id: admin._id,
          name: admin.username + " (Library Management)",
          email: admin.email,
          phone: admin.phone,
          libraryId: "ADMIN",
          bondedAt: library.createdAt || new Date(),
          friendshipId: "admin-default",
          userType: "Admin",
        });
      }
    }
  } catch (err) {
    console.error("❌ Failed to fetch admin for default friendship:", err.message);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, formatted, "Friends fetched"));
});

export const removeFriend = asyncHandler(async (req, res) => {
  const { friendId } = req.body;
  const studentId = req.student._id;

  if (!friendId) throw new ApiError(400, "friendId is required");

  const removed = await Friendship.findOneAndDelete({
    $or: [
      { studentA: studentId, studentB: friendId },
      { studentA: friendId, studentB: studentId },
    ],
  });

  // Also clean up any lingering request records
  await FriendRequest.deleteMany({
    $or: [
      { requesterId: studentId, recipientId: friendId },
      { requesterId: friendId, recipientId: studentId },
    ],
  });

  if (!removed) throw new ApiError(404, "Friend not found");

  try {
    const io = getIO();
    io.to(`student_${friendId}`).emit("friend:removed", {
      removedBy: studentId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Failed to emit friend:removed:", err);
  }

  return res.status(200).json(new ApiResponse(200, null, "Friend removed"));
});

export const blockStudent = asyncHandler(async (req, res) => {
  const { blockedId } = req.body;
  const studentId = req.student._id;

  if (!blockedId) throw new ApiError(400, "blockedId is required");
  if (blockedId.toString() === studentId.toString()) {
    throw new ApiError(400, "Cannot block yourself");
  }

  await ensureStudent(blockedId);

  await StudentBlock.findOneAndUpdate(
    { blockerId: studentId, blockedId },
    { blockerId: studentId, blockedId },
    { upsert: true, new: true },
  );

  await FriendRequest.deleteMany({
    $or: [
      { requesterId: studentId, recipientId: blockedId },
      { requesterId: blockedId, recipientId: studentId },
    ],
  });

  try {
    const io = getIO();
    io.to(`student_${blockedId}`).emit("friend:blocked", {
      blockedBy: studentId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Failed to emit friend:blocked:", err);
  }

  return res.status(200).json(new ApiResponse(200, null, "Student blocked"));
});

export const unblockStudent = asyncHandler(async (req, res) => {
  const { blockedId } = req.body;
  const studentId = req.student._id;

  if (!blockedId) throw new ApiError(400, "blockedId is required");

  await StudentBlock.findOneAndDelete({
    blockerId: studentId,
    blockedId,
  });

  return res.status(200).json(new ApiResponse(200, null, "Student unblocked"));
});

export const listBlocked = asyncHandler(async (req, res) => {
  const studentId = req.student._id;

  const blocks = await StudentBlock.find({ blockerId: studentId })
    .populate("blockedId", "_id name")
    .lean();

  const formatted = blocks.map((b) => ({
    _id: b.blockedId?._id,
    name: b.blockedId?.name,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, formatted, "Blocked list fetched"));
});

export const searchPeers = asyncHandler(async (req, res) => {
  const studentId = req.student._id;
  const tenantId = req.tenantId || req.student?.tenantId;

  const result = await StudentService.searchPeers(
    studentId,
    req.query,
    tenantId,
    req.student?.slotId,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Peers fetched successfully"));
});
