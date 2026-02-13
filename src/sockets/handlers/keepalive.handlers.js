export const registerKeepAliveHandlers = ({ socket }) => {
  // ========== KEEP ALIVE ==========
  socket.on("ping", () => {
    socket.emit("pong", { ts: Date.now() });
  });
};
