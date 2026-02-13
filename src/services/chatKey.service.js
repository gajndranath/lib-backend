import { ApiError } from "../utils/ApiError.js";
import { Admin } from "../models/admin.model.js";
import { Student } from "../models/student.model.js";
import { ConversationKey } from "../models/conversationKey.model.js";
import cacheService from "../utils/cache.js";
import logger from "../utils/logger.js";

class ChatKeyService {
  static async getPublicKey(userType, userId) {
    const cacheKey =
      userType === "Admin"
        ? `chat:admin:pk:${userId}`
        : `chat:student:pk:${userId}`;

    const cachedKey = await cacheService.get(cacheKey);
    if (cachedKey) {
      logger.debug("Public key cache hit", { userType, userId });
      return cachedKey.publicKey;
    }

    const Model = userType === "Admin" ? Admin : Student;
    const user = await Model.findById(userId).select("publicKey");
    if (!user) {
      logger.warn("Public key lookup failed - user not found", {
        userType,
        userId,
      });
      throw new ApiError(404, `${userType} not found`);
    }

    if (!user.publicKey) {
      logger.warn("Public key missing for user", { userType, userId });
      throw new ApiError(404, `${userType}'s public key not set yet`);
    }

    logger.info("Public key loaded from DB", { userType, userId });
    await cacheService.set(cacheKey, { publicKey: user.publicKey }, 30 * 60);

    return user.publicKey;
  }

  static async setConversationPublicKey({
    conversationId,
    userId,
    userType,
    publicKey,
  }) {
    await ConversationKey.findOneAndUpdate(
      { conversationId, userId, userType },
      { publicKey },
      { upsert: true, new: true },
    );

    const cacheKey = `chat:conv:pk:${conversationId}:${userType}:${userId}`;
    await cacheService.del(cacheKey);

    logger.info("Conversation public key updated", {
      conversationId,
      userId,
      userType,
    });
  }

  static async getConversationPublicKey({ conversationId, userId, userType }) {
    const cacheKey = `chat:conv:pk:${conversationId}:${userType}:${userId}`;

    const cachedKey = await cacheService.get(cacheKey);
    if (cachedKey) {
      logger.debug("Conversation public key cache hit", {
        conversationId,
        userId,
        userType,
      });
      return cachedKey.publicKey;
    }

    const key = await ConversationKey.findOne({
      conversationId,
      userId,
      userType,
    });

    if (!key) {
      logger.warn("Conversation public key not found", {
        conversationId,
        userId,
        userType,
      });
      throw new ApiError(404, "Conversation public key not found");
    }

    logger.info("Conversation public key loaded from DB", {
      conversationId,
      userId,
      userType,
    });

    await cacheService.set(cacheKey, { publicKey: key.publicKey }, 30 * 60);
    return key.publicKey;
  }
}

export default ChatKeyService;
