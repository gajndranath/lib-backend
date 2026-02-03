/**
 * Socket.io Cleanup & Memory Safety Configuration
 *
 * Enforces strict memory discipline for:
 * - Event listener removal on disconnect
 * - Timer/interval tracking and cleanup
 * - WebRTC object destruction
 * - Redis-based presence tracking (not RAM)
 * - Payload size validation
 */

/**
 * Maximum payload size (20KB)
 */
export const MAX_PAYLOAD_SIZE = 20 * 1024;

/**
 * Redis key prefixes with TTL
 */
export const REDIS_CONFIG = {
  PRESENCE_PREFIX: "presence:",
  PRESENCE_TTL: 3600, // 1 hour
  ICE_CANDIDATES_PREFIX: "call:ice:",
  ICE_CANDIDATES_TTL: 300, // 5 minutes
  SDP_CACHE_PREFIX: "call:sdp:",
  SDP_CACHE_TTL: 30, // 30 seconds
};

/**
 * Call timeout (1 minute until answer)
 */
export const CALL_CONFIG = {
  RINGING_TIMEOUT: 60000, // 60 seconds
  MAX_CALL_DURATION: 3600000, // 1 hour
  ICE_GATHERING_TIMEOUT: 5000, // 5 seconds
};

/**
 * Socket event listeners to manage
 */
export const SOCKET_EVENTS = [
  // Chat events
  "chat:send",
  "chat:delivered",
  "chat:read",
  "chat:typing",
  "chat:stop_typing",

  // Call events
  "call:offer",
  "call:answer",
  "call:ice",
  "call:end",
  "call:mute-status",

  // Notification events
  "mark_notification_read",

  // Status events
  "payment_updated",
  "student_added",
  "fee_status_changed",
  "reminder_triggered",

  // Keep alive
  "ping",

  // Lifecycle events
  "disconnecting",
  "disconnect",
  "error",
];

/**
 * Validation schemas for payloads
 */
export const PAYLOAD_SCHEMAS = {
  "chat:send": {
    required: ["conversationId", "recipientId", "recipientType"],
    optional: [
      "encryptedForRecipient",
      "encryptedForSender",
      "contentType",
      "senderName",
    ],
  },
  "call:offer": {
    required: ["recipientId", "recipientType", "sdp"],
    optional: ["conversationId"],
  },
  "call:answer": {
    required: ["callId", "recipientId", "recipientType", "sdp"],
  },
  "call:ice": {
    required: ["recipientId", "recipientType", "candidate", "callId"],
  },
  "call:end": {
    required: ["recipientId", "recipientType"],
    optional: ["callId", "conversationId"],
  },
};

/**
 * Interval management
 */
export const INTERVAL_CONFIG = {
  STATUS_BROADCAST: 60000, // 60 seconds
  MEMORY_CHECK: 30000, // 30 seconds
  CLEANUP_ORPHANED_CALLS: 120000, // 2 minutes
};

/**
 * Monitoring & debugging
 */
export const MONITORING = {
  ENABLE_SOCKET_LOGGING: true,
  ENABLE_PAYLOAD_LOGGING: false, // Don't log encrypted payloads
  ENABLE_TIMER_LOGGING: true,
  LOG_PREFIX: "🔌 Socket",
  ERROR_PREFIX: "❌ Socket Error",
};
