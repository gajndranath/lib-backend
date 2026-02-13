import { ChatConversation } from "../models/chatConversation.model.js";
import { ChatMessage } from "../models/chatMessage.model.js";
import { Admin } from "../models/admin.model.js";
import { Student } from "../models/student.model.js";
import { ConversationKey } from "../models/conversationKey.model.js";
import { ApiError } from "../utils/ApiError.js";
import ChatEncryptionService from "./chatEncryption.service.js";

const buildParticipantsHash = (a, b) => {
  const left = `${a.userType}:${a.userId.toString()}`;
  const right = `${b.userType}:${b.userId.toString()}`;
  return [left, right].sort().join("|");
};

class ChatService {
  static async getOrCreateConversation(participantA, participantB) {
    const participantsHash = buildParticipantsHash(participantA, participantB);

    let conversation = await ChatConversation.findOne({ participantsHash });
    if (!conversation) {
      conversation = await ChatConversation.create({
        participants: [participantA, participantB],
        participantsHash,
        lastMessageAt: null,
        lastMessagePreview: "",
      });
    }

    return conversation;
  }

  static async listConversations(userId, userType) {
    return ChatConversation.find({
      participants: {
        $elemMatch: { userId, userType },
      },
      isActive: true,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();
  }

  static async listMessages(conversationId, limit = 50, before) {
    const query = { conversationId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return messages.map((message) =>
      ChatEncryptionService.unwrapAtRestMessage(message),
    );
  }

  static async sendMessage({
    conversationId,
    senderId,
    senderType,
    recipientId,
    recipientType,
    encryptedForRecipient,
    encryptedForSender,
    senderPublicKey,
    contentType = "TEXT",
  }) {
    const Model = senderType === "Admin" ? Admin : Student;
    const sender = await Model.findById(senderId).select("publicKey");
    if (!sender) {
      throw new ApiError(404, "Sender not found");
    }

    const conversationKey = await ConversationKey.findOne({
      conversationId,
      userId: senderId,
      userType: senderType,
    }).select("publicKey");

    if (
      conversationKey?.publicKey &&
      conversationKey.publicKey !== senderPublicKey
    ) {
      throw new ApiError(
        400,
        "Conversation public key mismatch - possible tampering",
      );
    }

    ChatEncryptionService.validateMessageEncryption(
      { encryptedForRecipient, encryptedForSender, senderPublicKey },
      sender.publicKey,
    );

    const message = await ChatMessage.create({
      conversationId,
      senderId,
      senderType,
      recipientId,
      recipientType,
      encryptedForRecipient,
      encryptedForSender,
      senderPublicKey,
      contentType,
    });

    await ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: message.createdAt,
      lastMessagePreview: "Encrypted message",
    });

    return ChatEncryptionService.unwrapAtRestMessage(message);
  }

  static async markDelivered(messageId) {
    return ChatMessage.findByIdAndUpdate(
      messageId,
      { status: "DELIVERED", deliveredAt: new Date() },
      { new: true },
    );
  }

  static async markRead(messageId) {
    return ChatMessage.findByIdAndUpdate(
      messageId,
      { status: "READ", readAt: new Date() },
      { new: true },
    );
  }
}

export default ChatService;
