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
  static async getOrCreateConversation(participantA, participantB, tenantId) {
    const participantsHash = buildParticipantsHash(participantA, participantB);

    const conversation = await ChatConversation.findOneAndUpdate(
      { participantsHash }, // Find exclusively by hash to unify across tenants
      {
        $setOnInsert: {
          participants: [participantA, participantB],
          participantsHash,
          tenantId: tenantId || null, // Optional for global chats
          lastMessageAt: null,
          lastMessagePreview: "",
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate("participants.userId", "name username fullName profilePicture role")
      .lean();

    return {
      ...conversation,
      participants: conversation.participants.map((p) => ({
        participantId: p.userId?._id || p.userId,
        participantType: p.userType,
        name: p.userId?.fullName || p.userId?.name || p.userId?.username || (p.userType === "Admin" ? "Library Admin" : "Unknown User"),
        profilePicture: p.userId?.profilePicture,
        role: p.userId?.role,
      })),
    };
  }

  static async listConversations(userId, userType, tenantId) {
    const conversations = await ChatConversation.find({
      $or: [{ tenantId }, { tenantId: null }], // Relax filter to include legacy
      participants: {
        $elemMatch: { userId, userType },
      },
      isActive: true,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate("participants.userId", "name username fullName profilePicture role") // Include more fields
      .lean();

    // Map and add unread counts
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await ChatMessage.countDocuments({
          conversationId: conv._id,
          recipientId: userId,
          status: { $ne: "READ" },
        });
        const otherParticipant = conv.participants.find(
          (p) => p.userId?._id?.toString() !== userId.toString() && p.userId?.toString() !== userId.toString()
        );

        return {
          ...conv,
          unreadCount,
          participants: conv.participants.map((p) => ({
            participantId: p.userId?._id || p.userId,
            participantType: p.userType,
            name: p.userId?.fullName || p.userId?.name || p.userId?.username || (p.userType === "Admin" ? "Library Admin" : "Unknown User"),
            profilePicture: p.userId?.profilePicture,
            role: p.userId?.role,
          })),
        };
      })
    );
    return enriched;
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

    return messages.map((message) => {
      // If content exists, it's an Instagram-style message
      if (message.content) return message;
      // Fallback for legacy E2EE messages
      return ChatEncryptionService.unwrapAtRestMessage(message);
    });
  }

  static async sendMessage(data) {
    const {
      conversationId,
      senderId,
      senderType,
      recipientId,
      recipientType,
      content,
      contentType = "TEXT",
      tenantId,
      ...otherFields
    } = data;

    // 1. Validate / Converge conversation ID
    const participantsHash = buildParticipantsHash(
      { userId: senderId, userType: senderType },
      { userId: recipientId, userType: recipientType }
    );

    // PRIORITY 1: Find conversation by Participants Hash (Source of Truth for thread identity)
    // We check for any existing thread between these two, regardless of tenantId initially
    let existing = await ChatConversation.findOne({ participantsHash });
    
    let finalConversationId;

    if (existing) {
      finalConversationId = existing._id;
      // If the existing conversation has no tenantId or a different one, we update it 
      // to the sender's current tenantId to ensure visibility in their list.
      if (!existing.tenantId || (tenantId && existing.tenantId.toString() !== tenantId.toString())) {
        await ChatConversation.updateOne({ _id: existing._id }, { $set: { tenantId } });
      }
    } else {
      // PRIORITY 2: If no thread exists, create one
      const created = await ChatConversation.create({
        participants: [
          { userId: senderId, userType: senderType },
          { userId: recipientId, userType: recipientType }
        ],
        participantsHash,
        tenantId,
        isActive: true,
        lastMessageAt: new Date(),
        lastMessagePreview: contentType === "IMAGE" ? "📷 Image" : (content || "New message")
      });
      finalConversationId = created._id;
    }

    const message = await ChatMessage.create({
      conversationId: finalConversationId,
      senderId,
      senderType,
      recipientId,
      recipientType,
      content,
      contentType,
      tenantId,
      status: "SENT",
      ...otherFields
    });

    await ChatConversation.findByIdAndUpdate(finalConversationId, {
      lastMessageAt: message.createdAt,
      lastMessagePreview: contentType === "IMAGE" ? "📷 Image" : (content || "Encrypted message"),
    });

    return message.content ? message : ChatEncryptionService.unwrapAtRestMessage(message);
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

  static async markConversationAsRead(conversationId, recipientId) {
    await ChatMessage.updateMany(
      { conversationId, recipientId, status: { $ne: "READ" } },
      { $set: { status: "READ", readAt: new Date() } }
    );
    return true;
  }

  static async editMessage(messageId, userId, newContent) {
    const message = await ChatMessage.findOneAndUpdate(
      { _id: messageId, senderId: userId },
      { 
        $set: { content: newContent, editedAt: new Date() },
        $push: { 
          editHistory: { 
            editedAt: new Date(), 
            content: newContent // simplified for plain text
          } 
        }
      },
      { new: true }
    );
    
    if (!message) throw new ApiError(404, "Message not found or not authorized");

    // Update conversation preview if it was the last message
    await ChatConversation.updateOne(
      { _id: message.conversationId, lastMessageAt: message.createdAt },
      { $set: { lastMessagePreview: newContent } }
    );

    return message;
  }

  static async deleteMessage(messageId, userId) {
    const message = await ChatMessage.findOneAndUpdate(
      { _id: messageId, senderId: userId },
      { $set: { isDeleted: true, content: "This message was deleted" } },
      { new: true }
    );

    if (!message) throw new ApiError(404, "Message not found or not authorized");

    // Update conversation preview if it was the last message
    await ChatConversation.updateOne(
      { _id: message.conversationId, lastMessageAt: message.createdAt },
      { $set: { lastMessagePreview: "Message deleted" } }
    );

    return message;
  }

  static async toggleReaction(messageId, userId, userType, emoji) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new ApiError(404, "Message not found");

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingIndex > -1) {
      if (message.reactions[existingIndex].emoji === emoji) {
        // Same emoji -> Remove
        message.reactions.splice(existingIndex, 1);
      } else {
        // Different emoji -> Replace
        message.reactions[existingIndex].emoji = emoji;
        message.reactions[existingIndex].userType = userType; // Ensure type is correct
      }
    } else {
      // New reaction
      message.reactions.push({ userId, userType, emoji });
    }

    await message.save();
    return message;
  }

  static async logCall(conversationId, senderId, senderType, recipientId, recipientType, status, duration, tenantId) {
    const preview = status === "MISSED" ? "Missed Call" : `Audio Call (${Math.floor(duration/60)}m ${duration%60}s)`;
    
    const message = await ChatMessage.create({
      conversationId,
      senderId,
      senderType,
      recipientId,
      recipientType,
      contentType: "CALL",
      content: preview, // Store the call summary as content for rendering in chat
      callMetadata: {
        callStatus: status,
        duration: duration || 0,
        callType: "AUDIO"
      },
      status: "SENT",
      tenantId
    });

    // Update conversation last message
    await ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: preview
    });

    return message;
  }

  static async getUnreadBadgeCount(userId, userType) {
    const count = await ChatMessage.countDocuments({
      recipientId: userId,
      recipientType: userType,
      status: { $ne: "READ" },
      isDeleted: false
    });
    return count;
  }

  static async toggleBlock(conversationId, userId) {
    const conv = await ChatConversation.findById(conversationId);
    if (!conv) throw new Error("Conversation not found");

    const index = conv.blockedBy.indexOf(userId);
    if (index === -1) {
      conv.blockedBy.push(userId);
    } else {
      conv.blockedBy.splice(index, 1);
    }
    await conv.save();
    return conv;
  }

  static async toggleMute(conversationId, userId) {
    const conv = await ChatConversation.findById(conversationId);
    if (!conv) throw new Error("Conversation not found");

    const index = conv.mutedBy.indexOf(userId);
    if (index === -1) {
      conv.mutedBy.push(userId);
    } else {
      conv.mutedBy.splice(index, 1);
    }
    await conv.save();
    return conv;
  }

  static async softDelete(conversationId, userId) {
    const conv = await ChatConversation.findById(conversationId);
    if (!conv) throw new Error("Conversation not found");

    if (!conv.deletedBy.includes(userId)) {
      conv.deletedBy.push(userId);
      await conv.save();
    }
    return conv;
  }
}

export default ChatService;
