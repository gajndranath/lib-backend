import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  apiLimiter,
  chatLimiter,
  publicKeyLimiter,
} from "../middlewares/rateLimiter.middleware.js";
import {
  setAdminPublicKey,
  setAdminKeyBackup,
  getAdminKeyBackup,
  getPublicKey,
  setConversationPublicKey,
  getConversationPublicKey,
  createOrGetConversation,
  listConversations,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  forwardMessage,
} from "../controllers/chat.controller.js";

const router = Router();

// Apply appropriate rate limiters
router.use(verifyJWT);

// Public key fetching - very lenient rate limit (heavily cached)
router.route("/keys/:userType/:userId").get(publicKeyLimiter, getPublicKey);

// Public key setting - standard rate limit
router.route("/keys").post(apiLimiter, setAdminPublicKey);

// Key backup endpoints - standard rate limit
router.route("/keys/backup").get(apiLimiter, getAdminKeyBackup);
router.route("/keys/backup").post(apiLimiter, setAdminKeyBackup);

// ========== CONVERSATION-BASED PUBLIC KEY ENDPOINTS ==========
// Set public key for a specific conversation
router
  .route("/conversations/:conversationId/keys")
  .post(apiLimiter, setConversationPublicKey);

// Get public key for a specific user in a specific conversation
router
  .route("/conversations/:conversationId/keys/:userType/:userId")
  .get(publicKeyLimiter, getConversationPublicKey);

// Conversation endpoints - standard rate limit
router
  .route("/conversations")
  .get(apiLimiter, listConversations)
  .post(apiLimiter, createOrGetConversation);

// Message listing - standard rate limit
router
  .route("/conversations/:conversationId/messages")
  .get(apiLimiter, listMessages);

// Message sending - high rate limit (chat specific)
router.route("/messages").post(chatLimiter, sendMessage);

// ✅ Message edit, delete, forward - chat rate limit
router
  .route("/messages/:messageId")
  .put(chatLimiter, editMessage)
  .delete(chatLimiter, deleteMessage);
router.route("/messages/:messageId/forward").post(chatLimiter, forwardMessage);

export default router;
