import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { decryptText } from "../utils/crypto.js";

class ChatEncryptionService {
  static validatePublicKey(publicKey) {
    if (!publicKey || typeof publicKey !== "string") return false;
    try {
      const buf = Buffer.from(publicKey, "hex");
      return buf.length === 32;
    } catch {
      return false;
    }
  }

  static validateCiphertext(ciphertext) {
    if (!ciphertext || typeof ciphertext !== "string") return false;
    try {
      const buf = Buffer.from(ciphertext, "hex");
      return buf.length >= 48;
    } catch {
      return false;
    }
  }

  static validateEncryptedPayload(payload, label) {
    if (!payload || typeof payload !== "object") {
      throw new ApiError(400, `${label} payload is required`);
    }

    if (payload.algorithm !== "sealed_box") {
      throw new ApiError(400, `${label} algorithm must be sealed_box`);
    }

    if (!this.validateCiphertext(payload.ciphertext)) {
      throw new ApiError(400, `${label} ciphertext is invalid`);
    }
  }

  static validateMessageEncryption(
    { encryptedForRecipient, encryptedForSender, senderPublicKey },
    senderPublicKeyFromDB,
  ) {
    if (!senderPublicKey) {
      throw new ApiError(
        400,
        "Sender public key is required for E2E encryption",
      );
    }

    if (!this.validatePublicKey(senderPublicKey)) {
      throw new ApiError(400, "Sender public key format is invalid");
    }

    if (senderPublicKey !== senderPublicKeyFromDB) {
      logger.warn("Public key mismatch", {
        provided: senderPublicKey,
        stored: senderPublicKeyFromDB,
      });
      throw new ApiError(400, "Public key mismatch - possible tampering");
    }

    this.validateEncryptedPayload(encryptedForRecipient, "Recipient");
    this.validateEncryptedPayload(encryptedForSender, "Sender");

    return true;
  }

  static unwrapAtRestPayload(payload) {
    const secret =
      process.env.MESSAGE_AT_REST_SECRET || process.env.ACCESS_TOKEN_SECRET;

    if (!secret || !payload?.atRest?.enabled) return payload;

    try {
      const ciphertext = decryptText(
        {
          iv: payload.atRest.iv,
          tag: payload.atRest.tag,
          content: payload.ciphertext,
        },
        secret,
      );

      return {
        ...payload,
        ciphertext,
        atRest: undefined,
      };
    } catch (error) {
      logger.error("Failed to decrypt at-rest payload", {
        error: error.message,
      });
      return payload;
    }
  }

  static unwrapAtRestMessage(message) {
    if (!message) return message;

    const normalize = (payload) => this.unwrapAtRestPayload(payload);

    const cloned =
      typeof message.toObject === "function"
        ? message.toObject()
        : { ...message };

    cloned.encryptedForRecipient = normalize(cloned.encryptedForRecipient);
    cloned.encryptedForSender = normalize(cloned.encryptedForSender);

    if (Array.isArray(cloned.editHistory)) {
      cloned.editHistory = cloned.editHistory.map((entry) => ({
        ...entry,
        encryptedForRecipient: normalize(entry.encryptedForRecipient),
        encryptedForSender: normalize(entry.encryptedForSender),
      }));
    }

    return cloned;
  }
}

export default ChatEncryptionService;
