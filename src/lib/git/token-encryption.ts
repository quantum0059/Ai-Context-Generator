import crypto from "crypto";

const IV_LENGTH = 12; // 12 bytes / 96 bits is recommended for GCM
const TAG_LENGTH = 16; // 16 bytes / 128 bits for GCM auth tag
const ALGORITHM = "aes-256-gcm";

/**
 * Retrieves the encryption key from the GIT_TOKEN_ENCRYPTION_KEY environment variable.
 * The key must be a 64-character hex string representing a 32-byte key.
 */
function getEncryptionKey(): Buffer {
  const hexKey = process.env.GIT_TOKEN_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error("GIT_TOKEN_ENCRYPTION_KEY environment variable is not set.");
  }

  // Parse the hex key
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) {
    throw new Error("GIT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  }

  return key;
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Returns the encrypted string formatted as iv:tag:ciphertext.
 * 
 * @param plainText The plain text string to encrypt
 * @returns The encrypted string in the format "iv:tag:ciphertext" (all hex-encoded)
 */
export function encryptToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an encrypted string formatted as iv:tag:ciphertext using AES-256-GCM.
 * 
 * @param encrypted The encrypted string in the format "iv:tag:ciphertext" (all hex-encoded)
 * @returns The decrypted plain text string
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format. Expected iv:tag:ciphertext");
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid initialization vector length.");
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error("Invalid authentication tag length.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
