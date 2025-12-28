import { UserRoles } from "../constants/constants.js";

export const socketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("New socket connection:", socket.id);

    // Extract token from handshake
    const token = socket.handshake.auth.token;

    // Admin joins their specific room based on role
    socket.on("join_admin_room", (adminData) => {
      const { adminId, role } = adminData;

      if (role === UserRoles.SUPER_ADMIN || role === UserRoles.STAFF) {
        socket.join(`admin_${adminId}`);
        socket.join("admins");
        console.log(`Admin ${adminId} joined admin rooms`);

        // Notify others about new admin connection
        socket.to("admins").emit("admin_connected", {
          adminId,
          socketId: socket.id,
          timestamp: new Date(),
        });
      }
    });

    // Staff joins staff room
    socket.on("join_staff_room", (staffId) => {
      socket.join(`staff_${staffId}`);
      socket.join("staff");
      console.log(`Staff ${staffId} joined staff rooms`);
    });

    // Real-time payment update
    socket.on("payment_updated", (data) => {
      console.log("Payment updated event received:", data);

      // Emit to all admins
      io.to("admins").emit("payment_sync", {
        ...data,
        socketId: socket.id,
        timestamp: new Date(),
      });

      // Emit to specific student room if needed
      if (data.studentId) {
        io.to(`student_${data.studentId}`).emit("payment_status_changed", data);
      }
    });

    // Dashboard sync event
    socket.on("sync_dashboard", (data) => {
      io.to("admins").emit("dashboard_updated", {
        ...data,
        updatedBy: socket.id,
        timestamp: new Date(),
      });
    });

    // Notification alert
    socket.on("send_notification", (notification) => {
      io.to("admins").emit("new_notification", {
        ...notification,
        socketId: socket.id,
        timestamp: new Date(),
      });
    });

    // Student added event
    socket.on("student_added", (data) => {
      io.to("admins").emit("new_student", {
        ...data,
        socketId: socket.id,
        timestamp: new Date(),
      });
    });

    // Keep alive ping
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date() });
    });

    // Admin disconnecting
    socket.on("admin_disconnecting", (adminId) => {
      socket.to("admins").emit("admin_disconnected", {
        adminId,
        timestamp: new Date(),
      });
    });

    // Error handling
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, "Reason:", reason);

      // Notify other admins
      socket.to("admins").emit("user_disconnected", {
        socketId: socket.id,
        reason,
        timestamp: new Date(),
      });
    });

    // Connection error
    socket.conn.on("error", (err) => {
      console.error("Connection error:", err);
    });
  });

  // Global error handling
  io.engine.on("connection_error", (err) => {
    console.error("Socket connection error:", err);
  });

  // Periodic broadcast for connected clients
  setInterval(() => {
    const adminRooms = io.sockets.adapter.rooms.get("admins");
    const adminCount = adminRooms ? adminRooms.size : 0;

    io.to("admins").emit("connected_users", {
      adminCount,
      timestamp: new Date(),
    });
  }, 30000); // Every 30 seconds
};
