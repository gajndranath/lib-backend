import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ChatService from "../services/chat.service.js";
import { ChatMessage } from "../models/chatMessage.model.js";
import { Admin } from "../models/admin.model.js";
import { Student } from "../models/student.model.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import { StudentBlock } from "../models/studentBlock.model.js";
import { ConversationKey } from "../models/conversationKey.model.js";
import cacheService from "../utils/cache.js";

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

export const setStudentPublicKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) throw new ApiError(400, "publicKey is required");

  await Student.findByIdAndUpdate(req.student._id, { publicKey });

  // Invalidate cached public key for this student
  await cacheService.del(`chat:student:pk:${req.student._id}`);

  return res.status(200).json(new ApiResponse(200, null, "Public key updated"));
});

export const setStudentKeyBackup = asyncHandler(async (req, res) => {
  const { encryptedPrivateKey, salt, iv, version = 1, publicKey } = req.body;

  if (!encryptedPrivateKey || !salt || !iv || !publicKey) {
    throw new ApiError(
      400,
      "encryptedPrivateKey, salt, iv, publicKey are required",
    );
  }

  await Student.findByIdAndUpdate(req.student._id, {
    publicKey,
    encryptedPrivateKey,
    keyBackupSalt: salt,
    keyBackupIv: iv,
    keyBackupVersion: version,
    keyBackupUpdatedAt: new Date(),
  });

  await cacheService.del(`chat:student:pk:${req.student._id}`);

  return res.status(200).json(new ApiResponse(200, null, "Key backup updated"));
});

export const getStudentKeyBackup = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.student._id).select(
    "publicKey encryptedPrivateKey keyBackupSalt keyBackupIv keyBackupVersion",
  );

  if (
    !student?.encryptedPrivateKey ||
    !student.keyBackupSalt ||
    !student.keyBackupIv
  ) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Key backup not found"));
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        publicKey: student.publicKey,
        encryptedPrivateKey: student.encryptedPrivateKey,
        salt: student.keyBackupSalt,
        iv: student.keyBackupIv,
        version: student.keyBackupVersion ?? 1,
      },
      "Key backup",
    ),
  );
});

export const getPublicKey = asyncHandler(async (req, res) => {
  const { userType, userId } = req.params;
  const cacheKey =
    userType === "Admin"
      ? `chat:admin:pk:${userId}`
      : `chat:student:pk:${userId}`;

  // Try cache first
  let cachedKey = await cacheService.get(cacheKey);
  if (cachedKey) {
    return res
      .status(200)
      .json(
        new ApiResponse(200, { publicKey: cachedKey.publicKey }, "Public key"),
      );
  }

  const Model = userType === "Admin" ? Admin : Student;
  const user = await Model.findById(userId).select("publicKey");
  if (!user) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, `${userType} not found`));
  }

  if (!user.publicKey) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, `${userType}'s public key not set yet`));
  }

  // Cache for 30 minutes
  const keyData = { publicKey: user.publicKey };
  await cacheService.set(cacheKey, keyData, 30 * 60);

  return res.status(200).json(new ApiResponse(200, keyData, "Public key"));
});

// ========== CONVERSATION-BASED PUBLIC KEY MANAGEMENT ==========

export const setConversationPublicKey = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { publicKey } = req.body;

  if (!publicKey) {
    throw new ApiError(400, "publicKey is required");
  }

  const userId = req.student._id;
  const userType = "Student";

  // Upsert the conversation key
  await ConversationKey.findOneAndUpdate(
    { conversationId, userId, userType },
    { publicKey },
    { upsert: true, new: true },
  );

  // Invalidate cache
  const cacheKey = `chat:conv:pk:${conversationId}:${userType}:${userId}`;
  await cacheService.del(cacheKey);

  console.log(
    `🔐 Set conversation public key: conv=${conversationId.slice(0, 8)}... user=${userId}`,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Conversation public key updated"));
});

export const getConversationPublicKey = asyncHandler(async (req, res) => {
  const { conversationId, userId, userType } = req.params;

  if (!conversationId || !userId || !userType) {
    throw new ApiError(400, "conversationId, userId, userType are required");
  }

  const cacheKey = `chat:conv:pk:${conversationId}:${userType}:${userId}`;

  // Try cache first
  let cachedKey = await cacheService.get(cacheKey);
  if (cachedKey) {
    console.log(
      `📦 Cache hit for conversation public key: conv=${conversationId.slice(0, 8)}...`,
    );
    return res
      .status(200)
      .json(
        new ApiResponse(200, { publicKey: cachedKey.publicKey }, "Public key"),
      );
  }

  // Query database
  const key = await ConversationKey.findOne({
    conversationId,
    userId,
    userType,
  });

  if (!key) {
    console.warn(
      `⚠️ Conversation public key not found: conv=${conversationId.slice(0, 8)}... user=${userId}`,
    );
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Conversation public key not found"));
  }

  console.log(
    `✅ Found conversation public key from DB: conv=${conversationId.slice(0, 8)}...`,
  );

  // Cache for 30 minutes
  const keyData = { publicKey: key.publicKey };
  await cacheService.set(cacheKey, keyData, 30 * 60);

  return res.status(200).json(new ApiResponse(200, keyData, "Public key"));
});

// ========== CONVERSATION MANAGEMENT ==========

export const createOrGetConversation = asyncHandler(async (req, res) => {
  const { recipientId, recipientType } = req.body;
  if (!recipientId || !recipientType) {
    throw new ApiError(400, "recipientId and recipientType are required");
  }

  console.log("Creating conversation:", {
    studentId: req.student._id,
    recipientId,
    recipientType,
  });

  // Only enforce friend validation for Student-to-Student conversations
  if (recipientType === "Student") {
    await ensureNotBlocked(req.student._id, recipientId);
    const friendship = await FriendRequest.findOne({
      status: "ACCEPTED",
      $or: [
        { requesterId: req.student._id, recipientId },
        { requesterId: recipientId, recipientId: req.student._id },
      ],
    });

    if (!friendship) {
      console.log("No friendship found for student-to-student chat");
      throw new ApiError(403, "You can only chat with accepted friends");
    }
  } else {
    console.log("Admin conversation - no friend validation needed");
  }

  const conversation = await ChatService.getOrCreateConversation(
    { userId: req.student._id, userType: "Student" },
    { userId: recipientId, userType: recipientType },
  );

  return res
    .status(200)
    .json(new ApiResponse(200, conversation, "Conversation ready"));
});

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await ChatService.listConversations(
    req.student._id,
    "Student",
  );

  const unread = await ChatMessage.aggregate([
    {
      $match: {
        recipientId: req.student._id,
        status: { $ne: "READ" },
      },
    },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]);

  const unreadMap = new Map(unread.map((u) => [u._id.toString(), u.count]));

  const payload = conversations.map((c) => {
    const data = c.toObject ? c.toObject() : c;
    return {
      ...data,
      unreadCount: unreadMap.get(c._id.toString()) || 0,
    };
  });

  return res
    .status(200)
    .json(new ApiResponse(200, payload, "Conversations fetched"));
});

export const listMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { limit = 50, before } = req.query;

  const messages = await ChatService.listMessages(
    conversationId,
    parseInt(limit, 10),
    before,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, messages, "Messages fetched"));
});

export const sendMessage = asyncHandler(async (req, res) => {
  const {
    conversationId,
    recipientId,
    recipientType,
    encryptedForRecipient,
    encryptedForSender,
    senderPublicKey,
    contentType,
  } = req.body;

  if (!conversationId || !recipientId || !recipientType) {
    throw new ApiError(400, "Missing required fields");
  }

  if (recipientType === "Student") {
    await ensureNotBlocked(req.student._id, recipientId);
  }

  const message = await ChatService.sendMessage({
    conversationId,
    senderId: req.student._id,
    senderType: "Student",
    recipientId,
    recipientType,
    encryptedForRecipient,
    encryptedForSender,
    senderPublicKey,
    contentType,
  });

  return res.status(201).json(new ApiResponse(201, message, "Message sent"));
});
