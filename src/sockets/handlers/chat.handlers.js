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
      });

      const room = `${recipientType.toLowerCase()}_${recipientId}`;
      const payload =
        typeof message?.toObject === "function" ? message.toObject() : message;
      io.to(room).emit("chat:message", payload);
      socket.emit("chat:sent", payload);

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

      await NotificationService.sendChatNotification({
        recipientId,
        recipientType,
        conversationId,
        senderName: senderDisplayName,
      }).catch(() => {});
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
        const room = `${msg.senderType.toLowerCase()}_${msg.senderId}`;
        io.to(room).emit("chat:status", {
          messageId: msg._id,
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

  socket.on("chat:read", async ({ messageId }) => {
    if (!messageId) return;
    try {
      const msg = await ChatService.markRead(messageId);
      if (msg) {
        const room = `${msg.senderType.toLowerCase()}_${msg.senderId}`;
        io.to(room).emit("chat:status", {
          messageId: msg._id,
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

  socket.on("chat:typing", ({ recipientId, recipientType }) => {
    if (!recipientId || !recipientType) return;
    const throttleKey = `${userType}:${userId}:${recipientType}:${recipientId}`;
    if (!canEmitTyping(throttleKey)) return;
    const room = `${recipientType.toLowerCase()}_${recipientId}`;
    io.to(room).emit("chat:typing", { from: { userId, userType } });
  });

  socket.on("chat:stop_typing", ({ recipientId, recipientType }) => {
    if (!recipientId || !recipientType) return;
    const room = `${recipientType.toLowerCase()}_${recipientId}`;
    io.to(room).emit("chat:stop_typing", { from: { userId, userType } });
  });

  // ========== ACTIVE CONVERSATION TRACKING (to skip notifications) ==========

  socket.on("chat:set-active-conversation", async ({ conversationId }) => {
    try {
      if (conversationId) {
        const key = `active_chat:${userType}:${userId}`;
        await redisClient.setEx(key, 3600, conversationId).catch(() => {});
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
