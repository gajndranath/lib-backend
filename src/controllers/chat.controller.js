import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ChatService from "../services/chat.service.js";
import { ChatMessage } from "../models/chatMessage.model.js";
import { Admin } from "../models/admin.model.js";
import { Student } from "../models/student.model.js";
import ChatEncryptionService from "../services/chatEncryption.service.js";
import ChatKeyService from "../services/chatKey.service.js";
import cacheService from "../utils/cache.js";
import { UserKeyBackup } from "../models/userKeyBackup.model.js";

const isKeyBackupDisabled = () => process.env.DISABLE_KEY_BACKUP === "true";

export const setAdminPublicKey = asyncHandler(async (req, res) => {
  const { publicKey, rotate = false } = req.body;
  if (!publicKey) throw new ApiError(400, "publicKey is required");

  if (rotate) {
    const admin = await Admin.findById(req.admin._id).select("publicKey");
    await Admin.findByIdAndUpdate(req.admin._id, {
      publicKey,
      previousPublicKey: admin?.publicKey || null,
      publicKeyRotatedAt: new Date(),
    });
  } else {
    await Admin.findByIdAndUpdate(req.admin._id, { publicKey });
  }
  await cacheService.del(`chat:admin:pk:${req.admin._id}`);
  return res.status(200).json(new ApiResponse(200, null, "Public key updated"));
});

export const setAdminKeyBackup = asyncHandler(async (req, res) => {
  if (isKeyBackupDisabled()) {
    throw new ApiError(410, "Key backup storage is disabled");
  }

  const {
    encryptedPrivateKey,
    salt,
    iv,
    version = 1,
    publicKey,
    rotate = false,
  } = req.body;

  if (!encryptedPrivateKey || !salt || !iv || !publicKey) {
    throw new ApiError(
      400,
      "encryptedPrivateKey, salt, iv, publicKey are required",
    );
  }

  const admin = await Admin.findById(req.admin._id).select(
    "publicKey encryptedPrivateKey keyBackupSalt keyBackupIv keyBackupVersion",
  );

  if (rotate && admin?.encryptedPrivateKey) {
    await UserKeyBackup.create({
      userId: req.admin._id,
      userType: "Admin",
      publicKey: admin.publicKey,
      encryptedPrivateKey: admin.encryptedPrivateKey,
      keyBackupSalt: admin.keyBackupSalt,
      keyBackupIv: admin.keyBackupIv,
      keyBackupVersion: admin.keyBackupVersion ?? 1,
      rotatedAt: new Date(),
    });
  }

  await Admin.findByIdAndUpdate(req.admin._id, {
    publicKey,
    previousPublicKey: rotate ? admin?.publicKey || null : undefined,
    publicKeyRotatedAt: rotate ? new Date() : undefined,
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
  if (isKeyBackupDisabled()) {
    throw new ApiError(410, "Key backup storage is disabled");
  }

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

  const requestedVersion = req.query?.version
    ? parseInt(req.query.version, 10)
    : null;

  if (requestedVersion && admin.keyBackupVersion !== requestedVersion) {
    const backup = await UserKeyBackup.findOne({
      userId: req.admin._id,
      userType: "Admin",
      keyBackupVersion: requestedVersion,
    });

    if (!backup) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Key backup not found"));
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          publicKey: backup.publicKey,
          encryptedPrivateKey: backup.encryptedPrivateKey,
          salt: backup.keyBackupSalt,
          iv: backup.keyBackupIv,
          version: backup.keyBackupVersion,
        },
        "Key backup",
      ),
    );
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
  if (!req.admin && !req.student) {
    throw new ApiError(401, "Authentication required to access public keys");
  }

  const { userType, userId } = req.params;
  const publicKey = await ChatKeyService.getPublicKey(userType, userId);

  return res
    .status(200)
    .json(new ApiResponse(200, { publicKey }, "Public key"));
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

  await ChatKeyService.setConversationPublicKey({
    conversationId,
    userId,
    userType,
    publicKey,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Conversation public key updated"));
});

export const getConversationPublicKey = asyncHandler(async (req, res) => {
  const { conversationId, userId, userType } = req.params;

  if (!conversationId || !userId || !userType) {
    throw new ApiError(400, "conversationId, userId, userType are required");
  }

  const publicKey = await ChatKeyService.getConversationPublicKey({
    conversationId,
    userId,
    userType,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { publicKey }, "Public key"));
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

  if (!encryptedPayload) {
    throw new ApiError(400, "encryptedPayload is required");
  }

  const message = await ChatMessage.findById(messageId);
  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  // Check if requester is the sender
  if (message.senderId.toString() !== req.admin._id.toString()) {
    throw new ApiError(403, "Not authorized to edit this message");
  }

  ChatEncryptionService.validateEncryptedPayload(
    encryptedPayload,
    "Edited message",
  );

  // Update message
  const previousRecipient = message.encryptedForRecipient;
  const previousSender = message.encryptedForSender;

  if (text) {
    message.text = text;
  }

  message.encryptedForRecipient = encryptedPayload;
  message.encryptedForSender = encryptedPayload;
  message.editedAt = new Date();
  if (!message.editHistory) {
    message.editHistory = [];
  }
  message.editHistory.push({
    editedAt: new Date(),
    encryptedForRecipient: previousRecipient,
    encryptedForSender: previousSender,
  });

  await message.save();

  const payload = ChatEncryptionService.unwrapAtRestMessage(message);

  return res.status(200).json(new ApiResponse(200, payload, "Message edited"));
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

  if (!encryptedPayload) {
    throw new ApiError(400, "Message must be re-encrypted for new recipient");
  }

  ChatEncryptionService.validateEncryptedPayload(
    encryptedPayload,
    "Forwarded message",
  );

  // Create new message with forwardedFrom reference
  const newMessage = new ChatMessage({
    conversationId: originalMessage.conversationId,
    senderId: req.admin._id,
    senderType: "Admin",
    recipientId: originalMessage.recipientId,
    recipientType: originalMessage.recipientType,
    text: text || originalMessage.text,
    encryptedForRecipient: encryptedPayload,
    encryptedForSender: encryptedPayload,
    forwardedFrom: messageId,
    contentType: originalMessage.contentType || "TEXT",
    status: "SENT",
  });

  await newMessage.save();

  const payload = ChatEncryptionService.unwrapAtRestMessage(newMessage);

  return res
    .status(201)
    .json(new ApiResponse(201, payload, "Message forwarded"));
});
