import { ChatConversation } from "../../models/chatConversation.model.js";

export const registerChatHandlers = ({
  io,
  socket,
  userId,
  userType,
  redisClient,
  validatePayload,
  canEmitTyping,
  logger,
  ChatService,
  NotificationService,
}) => {
  // ========== HELPERS ==========
  const broadcastUnreadCount = async (targetUserId, targetUserType) => {
    try {
      const count = await ChatService.getUnreadBadgeCount(
        targetUserId,
        targetUserType,
      );
      const room = `${targetUserType.toLowerCase()}_${targetUserId.toString()}`;
      io.to(room).emit("chat:unread_count_update", { count });
    } catch (err) {
      logger.error("Failed to broadcast unread count", err.message);
    }
  };

  // ========== CHAT EVENTS (all validated) ==========

  socket.on("chat:send", async (payload) => {
    try {
      if (!validatePayload(payload)) {
        socket.emit("error", { msg: "Payload too large" });
        return;
      }

      const {
        conversationId,
        recipientId,
        recipientType,
        encryptedForRecipient,
        encryptedForSender,
        senderPublicKey,
        content,
        contentType,
        tempId,
      } = payload || {};
      if (!conversationId || !recipientId || !recipientType) return;

      const message = await ChatService.sendMessage({
        conversationId,
        senderId: userId,
        senderType: userType,
        recipientId,
        recipientType,
        encryptedForRecipient,
        encryptedForSender,
        senderPublicKey,
        content,
        contentType,
      });

      // Get sender's display name
      let senderDisplayName = userType;
      if (userType === "Student") {
        const student = await (
          await import("../../models/student.model.js")
        ).Student.findById(userId).select("name");
        senderDisplayName = student?.name || "Student";
      } else if (userType === "Admin") {
        const admin = await (
          await import("../../models/admin.model.js")
        ).Admin.findById(userId).select("name");
        senderDisplayName = admin?.name || "Admin";
      }

      const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
      const senderRoom = `${userType.toLowerCase()}_${userId.toString()}`;
      const messagePayload = {
        ...(typeof message?.toJSON === "function" ? message.toJSON() : message),
        ...(tempId && { tempId }), // Conditionally add tempId if it exists
      };
      logger.info("[Socket] Emitting new_message to recipient", {
        room,
        conversationId,
        recipientId,
        recipientType,
      });
      io.to(room).emit("new_message", messagePayload);
      io.to(senderRoom).emit("new_message", messagePayload); // Sync other tabs for the sender

      await NotificationService.sendChatNotification({
        recipientId,
        recipientType,
        conversationId,
      });

      // Broadcast unread count to recipient
      broadcastUnreadCount(recipientId, recipientType);
    } catch (err) {
      logger.error("chat:send failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("chat:delivered", async ({ messageId }) => {
    if (!messageId) return;
    try {
      const msg = await ChatService.markDelivered(messageId);
      if (msg) {
        const room = `${msg.senderType.toLowerCase()}_${msg.senderId.toString()}`;
        io.to(room).emit("chat:status", {
          messageId: msg._id,
          conversationId: msg.conversationId,
          status: msg.status,
        });
      }
    } catch (err) {
      logger.error("chat:delivered failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("chat:sync_delivery", async () => {
    try {
      const messages = await ChatService.markAllPendingAsDelivered(userId, userType);
      if (messages.length > 0) {
        // Group by sender to avoid excessive emissions
        const senderGroups = messages.reduce((acc, m) => {
          const key = `${m.senderType.toLowerCase()}_${m.senderId.toString()}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(m);
          return acc;
        }, {});

        for (const [room, msgs] of Object.entries(senderGroups)) {
          io.to(room).emit("chat:status_bulk", {
            status: "DELIVERED",
            messageIds: msgs.map(m => m._id)
          });
        }
      }
    } catch (err) {
      logger.error("chat:sync_delivery failed", { error: err.message });
    }
  });

  socket.on("chat:read", async ({ messageId }) => {
    if (!messageId) return;
    try {
      const msg = await ChatService.markRead(messageId);
      if (msg) {
        const room = `${msg.senderType.toLowerCase()}_${msg.senderId.toString()}`;
        io.to(room).emit("chat:status", {
          messageId: msg._id,
          conversationId: msg.conversationId,
          status: msg.status,
        });
      }
    } catch (err) {
      logger.error("chat:read failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("chat:read_all", async ({ conversationId }) => {
    if (!conversationId) return;
    try {
      await ChatService.markConversationAsRead(conversationId, userId);

      // Notify the other participants that their messages in this conversation are now READ
      // We need to find the other participant ID. For now, we can emit to the conversation room if we had one,
      // but we use personal rooms. So we just notify the "other" person.
      const conversation =
        await ChatConversation.findById(conversationId).lean();
      if (conversation) {
        const otherParticipant = conversation.participants.find(
          (p) => p.userId.toString() !== userId.toString(),
        );
        if (otherParticipant) {
          const room = `${otherParticipant.userType.toLowerCase()}_${otherParticipant.userId.toString()}`;
          io.to(room).emit("chat:status_bulk", {
            conversationId,
            status: "READ",
          });
        }
      }

      // Broadcast unread count to self (since it decreased)
      broadcastUnreadCount(userId, userType);
    } catch (err) {
      logger.error("chat:read_all failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("chat:typing", ({ recipientId, recipientType }) => {
    if (!recipientId || !recipientType) return;
    const throttleKey = `${userType}:${userId}:${recipientType}:${recipientId}`;
    if (!canEmitTyping(throttleKey)) return;
    const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
    io.to(room).emit("chat:typing", { from: { userId, userType } });
  });

  socket.on("chat:stop_typing", ({ recipientId, recipientType }) => {
    if (!recipientId || !recipientType) return;
    const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
    io.to(room).emit("chat:stop_typing", { from: { userId, userType } });
  });

  socket.on("chat:edit", async ({ messageId, conversationId, newContent }) => {
    if (!messageId || !newContent) return;
    try {
      const message = await ChatService.editMessage(
        messageId,
        userId,
        newContent,
      );
      if (message) {
        const room = `conv_${conversationId}`; // Better to use conv room if possible, but we use personal
        // For now, find other participant to notify
        const conversation =
          await ChatConversation.findById(conversationId).lean();
        if (conversation) {
          conversation.participants.forEach((p) => {
            const pRoom = `${p.userType.toLowerCase()}_${p.userId.toString()}`;
            io.to(pRoom).emit("chat:message_edited", {
              messageId,
              conversationId,
              content: newContent,
              editedAt: message.editedAt,
            });
          });
        }
      }
    } catch (err) {
      logger.error("chat:edit failed", { error: err.message, userId });
    }
  });

  socket.on("chat:delete", async ({ messageId, conversationId }) => {
    if (!messageId) return;
    try {
      const message = await ChatService.deleteMessage(messageId, userId);
      if (message) {
        const conversation =
          await ChatConversation.findById(conversationId).lean();
        if (conversation) {
          conversation.participants.forEach((p) => {
            const pRoom = `${p.userType.toLowerCase()}_${p.userId.toString()}`;
            io.to(pRoom).emit("chat:message_deleted", {
              messageId,
              conversationId,
            });
          });
        }
      }
    } catch (err) {
      logger.error("chat:delete failed", { error: err.message, userId });
    }
  });

  socket.on("chat:react", async ({ messageId, conversationId, emoji }) => {
    if (!messageId || !emoji) return;
    try {
      const message = await ChatService.toggleReaction(
        messageId,
        userId,
        userType,
        emoji,
      );
      if (message) {
        const conversation =
          await ChatConversation.findById(conversationId).lean();
        if (conversation) {
          conversation.participants.forEach((p) => {
            const pRoom = `${p.userType.toLowerCase()}_${p.userId.toString()}`;
            io.to(pRoom).emit("chat:reaction_updated", {
              messageId,
              conversationId,
              reactions: message.reactions,
            });
          });
        }
      }
    } catch (err) {
      logger.error("chat:react failed", { error: err.message, userId });
    }
  });

  socket.on("chat:toggle-block", async ({ conversationId }) => {
    try {
      await ChatService.toggleBlock(conversationId, userId);
      socket.emit("chat:status_changed", { conversationId, type: "BLOCK" });
    } catch (err) {
      logger.error("chat:toggle-block failed", err.message);
    }
  });

  socket.on("chat:toggle-mute", async ({ conversationId }) => {
    try {
      await ChatService.toggleMute(conversationId, userId);
      socket.emit("chat:status_changed", { conversationId, type: "MUTE" });
    } catch (err) {
      logger.error("chat:toggle-mute failed", err.message);
    }
  });

  socket.on("chat:delete-conversation", async ({ conversationId }) => {
    try {
      await ChatService.softDelete(conversationId, userId);
      socket.emit("chat:status_changed", { conversationId, type: "DELETE" });
    } catch (err) {
      logger.error("chat:delete-conversation failed", err.message);
    }
  });

  // ========== CALLING EVENTS (Signaling - Audio Only for 2G) ==========

  socket.on(
    "call:initiate",
    ({
      recipientId,
      recipientType,
      offer,
      callerName,
      conversationId,
      tenantId,
    }) => {
      const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
      io.to(room).emit("call:incoming", {
        callerId: userId,
        callerType: userType,
        callerName,
        offer,
        conversationId,
        tenantId,
        isVideo: false, // Forced false for 2G optimization
      });

      // Send Push Notification as backup
      NotificationService.sendCallNotification({
        recipientId,
        recipientType,
        callerName,
        conversationId,
        tenantId,
      }).catch(() => {});
    },
  );

  socket.on("call:accept", ({ callerId, callerType, answer, acceptorName }) => {
    const room = `${callerType.toLowerCase()}_${callerId.toString()}`;
    io.to(room).emit("call:accepted", {
      acceptorId: userId,
      acceptorType: userType,
      acceptorName,
      answer,
    });
  });

  socket.on(
    "call:reject",
    async ({ callerId, callerType, conversationId, tenantId }) => {
      const room = `${callerType.toLowerCase()}_${callerId.toString()}`;
      io.to(room).emit("call:rejected", {
        rejectorId: userId,
        rejectorType: userType,
      });

      // Log as rejected call
      await ChatService.logCall(
        conversationId,
        callerId,
        callerType,
        userId,
        userType,
        "REJECTED",
        0,
        tenantId,
      );
      broadcastUnreadCount(userId, userType);
    },
  );

  socket.on(
    "call:hangup",
    async ({
      otherId,
      otherType,
      conversationId,
      duration,
      status,
      tenantId,
    }) => {
      const room = `${otherType.toLowerCase()}_${otherId.toString()}`;
      io.to(room).emit("call:ended", {
        senderId: userId,
        senderType: userType,
      });

      // Log call
      if (conversationId) {
        // If status is MISSED, the caller hung up before answer
        // If status is COMPLETED, the call happened
        await ChatService.logCall(
          conversationId,
          userId,
          userType,
          otherId,
          otherType,
          status,
          duration,
          tenantId,
        );
        broadcastUnreadCount(otherId, otherType);
      }
    },
  );

  socket.on("call:ice_candidate", ({ otherId, otherType, candidate }) => {
    const room = `${otherType.toLowerCase()}_${otherId.toString()}`;
    io.to(room).emit("call:ice_candidate", {
      fromId: userId,
      fromType: userType,
      candidate,
    });
  });

  socket.on("call:ice_restart", ({ recipientId, recipientType, offer }) => {
    const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
    io.to(room).emit("call:ice_restart", {
      fromId: userId,
      fromType: userType,
      offer,
    });
  });

  socket.on(
    "call:ice_restart_answer",
    ({ recipientId, recipientType, answer }) => {
      const room = `${recipientType.toLowerCase()}_${recipientId.toString()}`;
      io.to(room).emit("call:ice_restart_answer", {
        fromId: userId,
        fromType: userType,
        answer,
      });
    },
  );

  // ========== ACTIVE CONVERSATION TRACKING (to skip notifications) ==========

  socket.on("chat:set-active-conversation", async ({ conversationId }) => {
    try {
      if (conversationId) {
        const key = `active_chat:${userType}:${userId}`;
        await redisClient.setex(key, 3600, conversationId).catch(() => {});
      }
    } catch (err) {
      logger.error("chat:set-active-conversation failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("chat:clear-active-conversation", async () => {
    try {
      const key = `active_chat:${userType}:${userId}`;
      await redisClient.del(key).catch(() => {});
    } catch (err) {
      logger.error("chat:clear-active-conversation failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });
};
