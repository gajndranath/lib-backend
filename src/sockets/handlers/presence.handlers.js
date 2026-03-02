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
      // 🔥 BROADCAST IMMEDIATELY ON CONNECTION/UPDATE
      io.emit("presence:update", {
        userType,
        userId,
        online: Boolean(online),
        ts: new Date(),
      });
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

  socket.on("presence:get_statuses", async ({ users }) => {
    if (!Array.isArray(users)) return;
    try {
      const results = await Promise.all(
        users.map(async (u) => {
          const key = `presence:${u.userType}:${u.userId}`;
          const data = await (await import("../../config/redis.js")).getRedisClient().get(key);
          const parsed = data ? JSON.parse(data) : { online: false };
          return { ...u, online: parsed.online };
        })
      );
      socket.emit("presence:statuses", { statuses: results });
    } catch (err) {
      logger.error("presence:get_statuses failed", { error: err.message });
    }
  });

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
