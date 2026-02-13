export const registerPaymentHandlers = ({ io, socket, validatePayload }) => {
  // ========== PAYMENT EVENTS ==========

  socket.on("payment_updated", (data) => {
    if (!validatePayload(data)) return;
    io.to("admins").emit("payment_sync", {
      ...data,
      timestamp: new Date(),
    });
    if (data.studentId) {
      io.to(`student_${data.studentId}`).emit("payment_received", data);
    }
  });

  socket.on("student_added", (data) => {
    if (!validatePayload(data)) return;
    io.to("admins").emit("new_student", data);
  });

  socket.on("fee_status_changed", (data) => {
    if (!validatePayload(data)) return;
    io.to("admins").emit("fee_update", data);
  });

  socket.on("reminder_triggered", (data) => {
    if (!validatePayload(data)) return;
    io.to("admins").emit("reminder_alert", data);
  });
};
