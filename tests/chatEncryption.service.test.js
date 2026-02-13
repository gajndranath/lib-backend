import { test } from "node:test";
import assert from "node:assert/strict";
import ChatEncryptionService from "../src/services/chatEncryption.service.js";
import { ApiError } from "../src/utils/ApiError.js";

const hexOfLength = (len) => "a".repeat(len);

const VALID_PUBLIC_KEY = hexOfLength(64); // 32 bytes
const VALID_CIPHERTEXT = hexOfLength(96); // 48 bytes

const buildPayload = (ciphertext = VALID_CIPHERTEXT) => ({
  algorithm: "sealed_box",
  ciphertext,
});

test("validatePublicKey returns true for valid 32-byte hex", () => {
  assert.equal(ChatEncryptionService.validatePublicKey(VALID_PUBLIC_KEY), true);
});

test("validatePublicKey returns false for invalid keys", () => {
  assert.equal(ChatEncryptionService.validatePublicKey(null), false);
  assert.equal(ChatEncryptionService.validatePublicKey(""), false);
  assert.equal(ChatEncryptionService.validatePublicKey("zz"), false);
  assert.equal(ChatEncryptionService.validatePublicKey(hexOfLength(62)), false);
});

test("validateCiphertext returns true for valid ciphertext", () => {
  assert.equal(
    ChatEncryptionService.validateCiphertext(VALID_CIPHERTEXT),
    true,
  );
});

test("validateCiphertext returns false for invalid ciphertext", () => {
  assert.equal(ChatEncryptionService.validateCiphertext(null), false);
  assert.equal(ChatEncryptionService.validateCiphertext(""), false);
  assert.equal(ChatEncryptionService.validateCiphertext("zz"), false);
  assert.equal(
    ChatEncryptionService.validateCiphertext(hexOfLength(94)),
    false,
  );
});

test("validateEncryptedPayload throws on invalid payload", () => {
  assert.throws(
    () => ChatEncryptionService.validateEncryptedPayload(null, "Test"),
    ApiError,
  );

  assert.throws(
    () =>
      ChatEncryptionService.validateEncryptedPayload(
        { algorithm: "other", ciphertext: VALID_CIPHERTEXT },
        "Test",
      ),
    ApiError,
  );

  assert.throws(
    () =>
      ChatEncryptionService.validateEncryptedPayload(
        { algorithm: "sealed_box", ciphertext: hexOfLength(10) },
        "Test",
      ),
    ApiError,
  );
});

test("validateMessageEncryption passes for valid payloads", () => {
  const payload = {
    encryptedForRecipient: buildPayload(),
    encryptedForSender: buildPayload(),
    senderPublicKey: VALID_PUBLIC_KEY,
  };

  assert.equal(
    ChatEncryptionService.validateMessageEncryption(payload, VALID_PUBLIC_KEY),
    true,
  );
});

test("validateMessageEncryption throws on key mismatch", () => {
  const payload = {
    encryptedForRecipient: buildPayload(),
    encryptedForSender: buildPayload(),
    senderPublicKey: VALID_PUBLIC_KEY,
  };

  assert.throws(
    () =>
      ChatEncryptionService.validateMessageEncryption(
        payload,
        hexOfLength(64 - 2),
      ),
    ApiError,
  );
});
