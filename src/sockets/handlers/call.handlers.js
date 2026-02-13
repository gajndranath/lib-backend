import { encryptText } from "../../utils/crypto.js";

export const registerCallHandlers = ({
  io,
  socket,
  userId,
  userType,
  redisClient,
  validatePayload,
  checkCallRateLimit,
  isValidIceCandidate,
  cleanupCall,
  addTimer,
  logger,
  CallSession,
  ChatConversation,
  NotificationService,
}) => {
  const sdpSecret =
    process.env.CALL_SDP_SECRET || process.env.ACCESS_TOKEN_SECRET;

  const encryptSdp = (sdp) => {
    if (!sdpSecret) {
      throw new Error("CALL_SDP_SECRET or ACCESS_TOKEN_SECRET is required");
    }

    return encryptText(sdp, sdpSecret);
  };
  // ========== WEBRTC CALLS (all validated & cleaned) ==========

  socket.on("call:offer", async (payload) => {
    try {
      if (!checkCallRateLimit(userType, userId)) {
        logger.warn("Call rate limit exceeded", { userId, userType });
        socket.emit("call:error", {
          msg: "Too many calls. Please wait and try again.",
        });
        return;
      }

      // WebRTC SDP can be large, allow bigger payloads here
      if (!validatePayload(payload, 120 * 1024)) {
        socket.emit("call:error", { msg: "Call offer too large" });
        return;
      }

      const { recipientId, recipientType, sdp, conversationId } = payload;

      if (!conversationId) {
        logger.warn("call:offer missing conversationId", { userId, userType });
        socket.emit("call:error", {
          msg: "Conversation ID is required for calls",
        });
        return;
      }

      if (!recipientId || !recipientType || !sdp) {
        logger.warn("call:offer missing required fields", {
          userId,
          userType,
          recipientId,
          recipientType,
        });
        socket.emit("call:error", {
          msg: "Missing required call parameters",
        });
        return;
      }

      const conversation = await ChatConversation.findOne({
        _id: conversationId,
        participants: {
          $all: [
            { $elemMatch: { userId, userType } },
            { $elemMatch: { userId: recipientId, userType: recipientType } },
          ],
        },
      }).select("_id");

      if (!conversation) {
        logger.warn("call:offer invalid conversation participants", {
          userId,
          userType,
          recipientId,
          recipientType,
          conversationId,
        });
        socket.emit("call:error", {
          msg: "Invalid conversation participants",
        });
        return;
      }

      const callSession = await CallSession.create({
        conversationId,
        participants: [
          { userId, userType },
          { userId: recipientId, userType: recipientType },
        ],
        status: "RINGING",
        startedAt: new Date(),
      });

      logger.info("Call initiated", {
        callId: callSession._id,
        from: { userId, userType },
        to: { userId: recipientId, userType: recipientType },
        conversationId,
      });

      // ✅ RULE 9: Store SDP in Redis with TTL (30s)
      const encryptedOffer = encryptSdp(sdp);
      await redisClient
        .setEx(
          `call:sdp:${callSession._id}`,
          30,
          JSON.stringify({ offer: encryptedOffer }),
        )
        .catch(() => {});

      const room = `${recipientType.toLowerCase()}_${recipientId}`;
      logger.info("Broadcasting call:offer", {
        room,
        callId: callSession._id,
      });
      io.to(room).emit("call:offer", {
        callId: callSession._id,
        from: { userId, userType },
        sdp,
        conversationId,
      });
      logger.info("call:offer sent", { callId: callSession._id });

      // Ack to caller with callId (needed for ICE candidates)
      socket.emit("call:offer:ack", {
        callId: callSession._id,
        recipientId,
        recipientType,
        conversationId,
      });

      // ✅ RULE 5: Auto-end unanswered calls after 60s
      const timeoutId = setTimeout(async () => {
        try {
          const call = await CallSession.findById(callSession._id);
          if (call && call.status === "RINGING") {
            await CallSession.findByIdAndUpdate(callSession._id, {
              status: "ENDED",
              endedAt: new Date(),
            });
            io.to(room).emit("call:timeout", { callId: callSession._id });
            await cleanupCall(callSession._id, socket.id);
          }
        } catch (err) {
          logger.error("Call timeout error", {
            error: err.message,
            stack: err.stack,
            callId: callSession._id,
          });
        }
      }, 60000);

      addTimer(socket.id, timeoutId);

      await NotificationService.sendInAppNotification({
        userId: recipientId,
        userType: recipientType,
        title: "Incoming Call",
        message: "You have an incoming call",
        type: "CALL",
        data: { callId: callSession._id },
      }).catch(() => {});
    } catch (err) {
      logger.error("call:offer failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
      socket.emit("call:error", { msg: "Call offer failed" });
    }
  });

  socket.on("call:answer", async (payload) => {
    try {
      // WebRTC SDP can be large, allow bigger payloads here
      if (!validatePayload(payload, 120 * 1024)) {
        socket.emit("call:error", { msg: "Call answer too large" });
        return;
      }
      const { callId, recipientId, recipientType, sdp } = payload || {};
      if (!callId || !recipientId || !recipientType || !sdp) {
        logger.warn("call:answer missing required fields", {
          userId,
          userType,
          recipientId,
          recipientType,
          hasSdp: Boolean(sdp),
        });
        socket.emit("call:error", {
          msg: "Missing required call parameters",
        });
        return;
      }

      const call = await CallSession.findOne({
        _id: callId,
        status: "RINGING",
        participants: {
          $all: [
            { $elemMatch: { userId, userType } },
            { $elemMatch: { userId: recipientId, userType: recipientType } },
          ],
        },
      }).select("_id");

      if (!call) {
        logger.warn("call:answer invalid call session", {
          userId,
          userType,
          recipientId,
          recipientType,
          callId,
        });
        socket.emit("call:error", { msg: "Invalid call session" });
        return;
      }

      await CallSession.findByIdAndUpdate(callId, { status: "ACCEPTED" });

      // ✅ RULE 9: Store answer SDP in Redis (TTL 30s)
      const encryptedAnswer = encryptSdp(sdp);
      await redisClient
        .setEx(
          `call:sdp:${callId}`,
          30,
          JSON.stringify({ answer: encryptedAnswer }),
        )
        .catch(() => {});

      const room = `${recipientType.toLowerCase()}_${recipientId}`;
      io.to(room).emit("call:answer", { callId, sdp });
    } catch (err) {
      logger.error("call:answer failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
      socket.emit("call:error", { msg: "Call answer failed" });
    }
  });

  // ✅ RULE 5: ICE candidates in Redis with TTL
  socket.on("call:ice", (payload) => {
    const { recipientId, recipientType, candidate, callId } = payload || {};
    if (!recipientId || !recipientType || !callId) return;
    if (!validatePayload(candidate)) return;
    if (!isValidIceCandidate(candidate)) {
      logger.warn("Invalid ICE candidate", {
        userId,
        userType,
        callId,
        recipientId,
        recipientType,
      });
      return;
    }

    // Store in Redis, not memory
    redisClient
      .lpush(`call:ice:${callId}`, JSON.stringify(candidate))
      .catch(() => {});
    redisClient.expire(`call:ice:${callId}`, 300).catch(() => {}); // 5 min TTL

    const room = `${recipientType.toLowerCase()}_${recipientId}`;
    io.to(room).emit("call:ice", { callId, candidate });
  });

  // ✅ RULE 5: Full cleanup on call end
  socket.on("call:end", async (payload) => {
    try {
      const { callId, recipientId, recipientType } = payload || {};

      if (callId) {
        await cleanupCall(callId, socket.id);
      }

      const room = `${recipientType.toLowerCase()}_${recipientId}`;
      io.to(room).emit("call:end", { callId });
    } catch (err) {
      logger.error("call:end failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });

  socket.on("call:mute-status", (payload) => {
    try {
      const { recipientId, recipientType, isMuted } = payload || {};
      if (!recipientId || !recipientType) return;
      const room = `${recipientType.toLowerCase()}_${recipientId}`;
      io.to(room).emit("call:mute-status", { isMuted });
    } catch (err) {
      logger.error("call:mute-status failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });
};
