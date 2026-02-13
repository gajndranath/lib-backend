export const registerDisconnectHandlers = ({
  io,
  socket,
  userId,
  userType,
  logger,
  CallSession,
  cleanupCall,
  clearSocketTimers,
}) => {
  // ========== DISCONNECT - CRITICAL CLEANUP ==========

  socket.on("disconnecting", () => {
    // ...existing code...
  });

  socket.on("disconnect", async (reason) => {
    // ...existing code...

    try {
      // ✅ RULE 2 & 3: Complete disconnect cleanup

      // 1. Remove ALL listeners
      socket.removeAllListeners();

      // 2. Clear all timers
      clearSocketTimers(socket.id);

      // 3. End active calls
      const calls = await CallSession.find({
        participants: { $elemMatch: { userId, userType } },
        status: { $in: ["RINGING", "ACCEPTED"] },
      }).catch(() => []);

      for (const call of calls) {
        await cleanupCall(call._id, socket.id);
      }

      // 4. Notify others
      io.emit("presence:update", {
        userType,
        userId,
        online: false,
        ts: new Date(),
      });

      // ...existing code...
    } catch (err) {
      logger.error("Disconnect cleanup error", {
        error: err.message,
        stack: err.stack,
        socketId: socket.id,
      });
    }
  });

  socket.on("error", (err) => {
    logger.error("Socket error", {
      socketId: socket.id,
      error: err.message,
      stack: err.stack,
    });
  });
};
