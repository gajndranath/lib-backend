export const registerPresenceHandlers = ({
  io,
  socket,
  userId,
  userType,
  setPresenceRedis,
  removePresenceRedis,
  logger,
  initialOnline = true,
}) => {
  const updatePresence = async (online) => {
    try {
      await setPresenceRedis(userType, userId, online);
    } catch (err) {
      logger.error("Presence update failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  };

  if (initialOnline) {
    updatePresence(true);
  }

  socket.on("presence:update", async ({ online }) => {
    await updatePresence(Boolean(online));
    io.emit("presence:update", {
      userType,
      userId,
      online: Boolean(online),
      ts: new Date(),
    });
  });

  socket.on("disconnect", async () => {
    await removePresenceRedis(userType, userId);
  });
};
