import { UserRoles } from "../constants/constants.js";
import Notification from "../models/notification.model.js";

export const socketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("New socket connection:", socket.id);

    // Extract admin data from handshake
    const { adminId, role } = socket.handshake.auth;

    // Join admin room
    if (
      adminId &&
      (role === UserRoles.SUPER_ADMIN || role === UserRoles.STAFF)
    ) {
      socket.join(`admin_${adminId}`);
      socket.join("admins");
      console.log(`Admin ${adminId} joined admin rooms`);

      // Emit connection status
      socket.emit("connected", {
        success: true,
        message: "Connected to notification server",
        timestamp: new Date(),
      });

      // Send pending notifications
      Notification.find({
        userId: adminId,
        read: false,
        delivered: false,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .then((notifications) => {
          notifications.forEach((notification) => {
            socket.emit("notification", notification);
            // Mark as delivered
            notification.markAsDelivered("IN_APP", "DELIVERED");
          });
        });
    }

    // Real-time payment update
    socket.on("payment_updated", (data) => {
      console.log("Payment updated event:", data);

      // Broadcast to all admins
      io.to("admins").emit("payment_sync", {
        ...data,
        timestamp: new Date(),
      });

      // Notify specific student if connected
      if (data.studentId) {
        io.to(`student_${data.studentId}`).emit("payment_received", data);
      }
    });

    // Student added event
    socket.on("student_added", (data) => {
      io.to("admins").emit("new_student", {
        ...data,
        timestamp: new Date(),
      });
    });

    // Fee status changed
    socket.on("fee_status_changed", (data) => {
      io.to("admins").emit("fee_update", {
        ...data,
        timestamp: new Date(),
      });
    });

    // Reminder triggered
    socket.on("reminder_triggered", (data) => {
      io.to("admins").emit("reminder_alert", {
        ...data,
        timestamp: new Date(),
      });
    });

    // Mark notification as read
    socket.on("mark_notification_read", async (notificationId) => {
      try {
        const notification = await Notification.findById(notificationId);
        if (notification) {
          await notification.markAsRead();
          socket.emit("notification_read", { notificationId, success: true });
        }
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    });

    // Keep alive ping
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date() });
    });

    // Admin disconnecting
    socket.on("disconnecting", () => {
      console.log("Admin disconnecting:", socket.id);
      io.to("admins").emit("admin_disconnected", {
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
    });
  });

  // Global error handling
  io.engine.on("connection_error", (err) => {
    console.error("Socket connection error:", err);
  });

  // Periodic status broadcast
  setInterval(() => {
    const adminRooms = io.sockets.adapter.rooms.get("admins");
    const adminCount = adminRooms ? adminRooms.size : 0;

    io.to("admins").emit("system_status", {
      adminCount,
      timestamp: new Date(),
      uptime: process.uptime(),
    });
  }, 60000); // Every 60 seconds
};
