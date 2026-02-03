import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  apiLimiter,
  chatLimiter,
  publicKeyLimiter,
} from "../middlewares/rateLimiter.middleware.js";
import {
  setAdminPublicKey,
  getPublicKey,
  createOrGetConversation,
  listConversations,
  listMessages,
  sendMessage,
} from "../controllers/chat.controller.js";

const router = Router();

// Apply appropriate rate limiters
router.use(verifyJWT);

// Public key fetching - very lenient rate limit (heavily cached)
router.route("/keys/:userType/:userId").get(publicKeyLimiter, getPublicKey);

// Public key setting - standard rate limit
router.route("/keys").post(apiLimiter, setAdminPublicKey);

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

export default router;
