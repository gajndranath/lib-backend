import crypto from "crypto";

const getKey = (secret) => crypto.createHash("sha256").update(secret).digest();

export const encryptText = (plaintext, secret) => {
  if (!secret) {
    throw new Error("Missing encryption secret");
  }

  const iv = crypto.randomBytes(12);
  const key = getKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    content: encrypted.toString("hex"),
    alg: "aes-256-gcm",
  };
};

export const decryptText = (payload, secret) => {
  if (!secret) {
    throw new Error("Missing encryption secret");
  }

  const { iv, tag, content } = payload || {};
  if (!iv || !tag || !content) {
    throw new Error("Invalid encrypted payload");
  }

  const key = getKey(secret);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(content, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
