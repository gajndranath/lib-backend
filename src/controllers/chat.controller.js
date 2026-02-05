import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ChatService from "../services/chat.service.js";
import { ChatMessage } from "../models/chatMessage.model.js";
import { Admin } from "../models/admin.model.js";
import { Student } from "../models/student.model.js";
import { ConversationKey } from "../models/conversationKey.model.js";
import cacheService from "../utils/cache.js";

export const setAdminPublicKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) throw new ApiError(400, "publicKey is required");

  await Admin.findByIdAndUpdate(req.admin._id, { publicKey });
  await cacheService.del(`chat:admin:pk:${req.admin._id}`);
  return res.status(200).json(new ApiResponse(200, null, "Public key updated"));
});

export const setAdminKeyBackup = asyncHandler(async (req, res) => {
  const { encryptedPrivateKey, salt, iv, version = 1, publicKey } = req.body;

  if (!encryptedPrivateKey || !salt || !iv || !publicKey) {
    throw new ApiError(
      400,
      "encryptedPrivateKey, salt, iv, publicKey are required",
    );
  }

  await Admin.findByIdAndUpdate(req.admin._id, {
    publicKey,
    encryptedPrivateKey,
    keyBackupSalt: salt,
    keyBackupIv: iv,
    keyBackupVersion: version,
    keyBackupUpdatedAt: new Date(),
  });

  await cacheService.del(`chat:admin:pk:${req.admin._id}`);

  return res.status(200).json(new ApiResponse(200, null, "Key backup updated"));
});

export const getAdminKeyBackup = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.admin._id).select(
    "publicKey encryptedPrivateKey keyBackupSalt keyBackupIv keyBackupVersion",
  );

  if (
    !admin?.encryptedPrivateKey ||
    !admin.keyBackupSalt ||
    !admin.keyBackupIv
  ) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Key backup not found"));
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        publicKey: admin.publicKey,
        encryptedPrivateKey: admin.encryptedPrivateKey,
        salt: admin.keyBackupSalt,
        iv: admin.keyBackupIv,
        version: admin.keyBackupVersion ?? 1,
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
  const cacheService = (await import("../utils/cache.js")).default;
  let cachedKey = await cacheService.get(cacheKey);
  if (cachedKey) {
    console.log(`📦 Cache hit for ${userType} ${userId} public key`);
    return res
      .status(200)
      .json(
        new ApiResponse(200, { publicKey: cachedKey.publicKey }, "Public key"),
      );
  }

  const Model = userType === "Admin" ? Admin : Student;
  const user = await Model.findById(userId).select("publicKey");
  if (!user) {
    console.warn(`⚠️ ${userType} ${userId} not found`);
    return res
      .status(404)
      .json(new ApiResponse(404, null, `${userType} not found`));
  }

  if (!user.publicKey) {
    console.warn(
      `⚠️ ${userType} ${userId} has no public key set yet. Stored keys:`,
      user.publicKey ? "EXISTS" : "MISSING",
    );
    return res
      .status(404)
      .json(new ApiResponse(404, null, `${userType}'s public key not set yet`));
  }

  console.log(`✅ Found ${userType} ${userId} public key from DB`);

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

  const userId = req.admin._id;
  const userType = "Admin";

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

// ========== CONVERSATION-BASED KEYPAIR MANAGEMENT (BACKUP) ==========
// Stores full keypair (public + private) for recovery after logout

export const setConversationKeyPair = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { publicKey, privateKey } = req.body;

  if (!publicKey || !privateKey) {
    throw new ApiError(400, "publicKey and privateKey are required");
  }

  const userId = req.admin._id;
  const userType = "Admin";

  // Upsert the conversation keypair
  await ConversationKey.findOneAndUpdate(
    { conversationId, userId, userType },
    { publicKey, privateKey },
    { upsert: true, new: true },
  );

  const cacheKey = `chat:conv:pk:${conversationId}:${userType}:${userId}`;
  await cacheService.del(cacheKey);

  console.log(
    `🔐 Backed up conversation keypair: conv=${conversationId.slice(0, 8)}...`,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Conversation keypair backed up"));
});

export const getConversationKeyPair = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.admin._id;
  const userType = "Admin";

  const key = await ConversationKey.findOne({
    conversationId,
    userId,
    userType,
  }).select("publicKey privateKey");

  if (!key?.privateKey) {
    console.warn(
      `⚠️ Conversation keypair not found: conv=${conversationId.slice(0, 8)}...`,
    );
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Conversation keypair not found"));
  }

  console.log(
    `✅ Retrieved conversation keypair: conv=${conversationId.slice(0, 8)}...`,
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        publicKey: key.publicKey,
        privateKey: key.privateKey,
      },
      "Keypair",
    ),
  );
});

// ========== CONVERSATION MANAGEMENT ==========

export const createOrGetConversation = asyncHandler(async (req, res) => {
  const { recipientId, recipientType } = req.body;
  if (!recipientId || !recipientType) {
    throw new ApiError(400, "recipientId and recipientType are required");
  }

  const conversation = await ChatService.getOrCreateConversation(
    { userId: req.admin._id, userType: "Admin" },
    { userId: recipientId, userType: recipientType },
  );

  return res
    .status(200)
    .json(new ApiResponse(200, conversation, "Conversation ready"));
});

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await ChatService.listConversations(
    req.admin._id,
    "Admin",
  );

  const unread = await ChatMessage.aggregate([
    {
      $match: {
        recipientId: req.admin._id,
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

  const message = await ChatService.sendMessage({
    conversationId,
    senderId: req.admin._id,
    senderType: "Admin",
    recipientId,
    recipientType,
    encryptedForRecipient,
    encryptedForSender,
    senderPublicKey,
    contentType,
  });

  return res.status(201).json(new ApiResponse(201, message, "Message sent"));
});

// ✅ Edit message
export const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text, encryptedPayload } = req.body;

  if (!text || !encryptedPayload) {
    throw new ApiError(400, "text and encryptedPayload are required");
  }

  const message = await ChatMessage.findById(messageId);
  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  // Check if requester is the sender
  if (message.senderId.toString() !== req.admin._id.toString()) {
    throw new ApiError(403, "Not authorized to edit this message");
  }

  // Update message
  message.text = text;
  message.encryptedForRecipient = encryptedPayload;
  message.editedAt = new Date();
  if (!message.editHistory) {
    message.editHistory = [];
  }
  message.editHistory.push({
    text: message.text,
    editedAt: new Date(),
  });

  await message.save();

  return res.status(200).json(new ApiResponse(200, message, "Message edited"));
});

// ✅ Delete message
export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  const message = await ChatMessage.findById(messageId);
  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  // Check if requester is the sender
  if (message.senderId.toString() !== req.admin._id.toString()) {
    throw new ApiError(403, "Not authorized to delete this message");
  }

  // Soft delete
  message.isDeleted = true;
  message.deletedAt = new Date();
  await message.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Message deleted successfully"));
});

// ✅ Forward message
export const forwardMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text, encryptedPayload } = req.body;

  const originalMessage = await ChatMessage.findById(messageId);
  if (!originalMessage) {
    throw new ApiError(404, "Message not found");
  }

  // Create new message with forwardedFrom reference
  const newMessage = new ChatMessage({
    conversationId: originalMessage.conversationId,
    senderId: req.admin._id,
    senderType: "Admin",
    recipientId: originalMessage.recipientId,
    recipientType: originalMessage.recipientType,
    text: text || originalMessage.text,
    encryptedForRecipient:
      encryptedPayload || originalMessage.encryptedForRecipient,
    encryptedForSender: encryptedPayload || originalMessage.encryptedForSender,
    forwardedFrom: messageId,
    contentType: originalMessage.contentType || "TEXT",
    status: "SENT",
  });

  await newMessage.save();

  return res
    .status(201)
    .json(new ApiResponse(201, newMessage, "Message forwarded"));
});
