export const registerNotificationHandlers = ({
  socket,
  userId,
  userType,
  Notification,
  logger,
}) => {
  // ========== NOTIFICATIONS ==========

  socket.on("mark_notification_read", async (notificationId) => {
    try {
      const n = await Notification.findById(notificationId);
      if (n) {
        await n.markAsRead();
        socket.emit("notification_read", { notificationId, success: true });
      }
    } catch (err) {
      logger.error("mark_notification_read failed", {
        error: err.message,
        stack: err.stack,
        userId,
        userType,
      });
    }
  });
};
