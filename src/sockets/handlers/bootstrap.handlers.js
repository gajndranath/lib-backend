export const registerBootstrapHandlers = ({
  socket,
  userId,
  userType,
  Notification,
  logger,
}) => {
  // Initial notification fetch on connection
  Notification.find({
    userId,
    userType,
    read: false,
    delivered: false,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .then((notifications) => {
      notifications.forEach((n) => {
        socket.emit("notification", n);
        n.markAsDelivered("IN_APP", "DELIVERED").catch(() => {});
      });
    })
    .catch((err) =>
      logger.error("Notification fetch error", {
        error: err.message,
        stack: err.stack,
      }),
    );
};
