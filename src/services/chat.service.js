import { ChatConversation } from "../models/chatConversation.model.js";
import { ChatMessage } from "../models/chatMessage.model.js";
import { ApiError } from "../utils/ApiError.js";

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
    }).sort({ lastMessageAt: -1, updatedAt: -1 });
  }

  static async listMessages(conversationId, limit = 50, before) {
    const query = { conversationId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return messages;
  }

  static async sendMessage({
    conversationId,
    senderId,
    senderType,
    recipientId,
    recipientType,
    encryptedForRecipient,
    encryptedForSender,
    contentType = "TEXT",
  }) {
    if (!encryptedForRecipient?.ciphertext || !encryptedForSender?.ciphertext) {
      throw new ApiError(400, "Encrypted payloads are required");
    }

    const message = await ChatMessage.create({
      conversationId,
      senderId,
      senderType,
      recipientId,
      recipientType,
      encryptedForRecipient,
      encryptedForSender,
      contentType,
    });

    await ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: message.createdAt,
      lastMessagePreview: "Encrypted message",
    });

    return message;
  }

  static async markDelivered(messageId) {
    return ChatMessage.findByIdAndUpdate(
      messageId,
      { status: "DELIVERED" },
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
