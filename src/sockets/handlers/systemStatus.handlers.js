export const registerSystemStatusHandlers = ({ io, logger, appIntervals }) => {
  if (!io._statusInterval) {
    const intervalId = setInterval(() => {
      try {
        const adminRooms = io.sockets.adapter.rooms.get("admins");
        const count = adminRooms ? adminRooms.size : 0;

        io.to("admins").emit("system_status", {
          adminCount: count,
          ts: new Date(),
          uptime: process.uptime(),
        });
      } catch (err) {
        logger.error("Status broadcast error", {
          error: err.message,
          stack: err.stack,
        });
      }
    }, 60000);

    io._statusInterval = intervalId;
    appIntervals.push(intervalId);
  }

  process.on("SIGTERM", () => {
    logger.info("Cleaning up intervals");
    appIntervals.forEach(clearInterval);
  });
};
