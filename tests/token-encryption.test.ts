import { describe, expect, it, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { encryptToken, decryptToken } from "../src/lib/git/token-encryption";

describe("token-encryption utility", () => {
  let originalKey: string | undefined;
  // A valid 32-byte key represented as a 64-character hex string
  const validTestKey = crypto.randomBytes(32).toString("hex");

  beforeEach(() => {
    originalKey = process.env.GIT_TOKEN_ENCRYPTION_KEY;
    process.env.GIT_TOKEN_ENCRYPTION_KEY = validTestKey;
  });

  afterEach(() => {
    process.env.GIT_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it("successfully performs a round-trip encrypt -> decrypt", () => {
    const plainText = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    const encrypted = encryptToken(plainText);

    // Assert that formatting is correct (iv:tag:ciphertext)
    expect(encrypted).toContain(":");
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);

    const [ivHex, tagHex, ciphertextHex] = parts;
    expect(ivHex.length).toBe(24); // 12 bytes = 24 hex chars
    expect(tagHex.length).toBe(32); // 16 bytes = 32 hex chars
    expect(ciphertextHex.length).toBeGreaterThan(0);

    // Assert that ciphertext does not contain plaintext
    expect(encrypted).not.toContain(plainText);
    expect(ciphertextHex).not.toBe(plainText);

    // Decrypt and confirm matching plaintext
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it("produces unique ciphertexts (and IVs) for the same plaintext", () => {
    const plainText = "same_secret_token";
    const encrypted1 = encryptToken(plainText);
    const encrypted2 = encryptToken(plainText);

    expect(encrypted1).not.toBe(encrypted2);

    const [iv1] = encrypted1.split(":");
    const [iv2] = encrypted2.split(":");
    expect(iv1).not.toBe(iv2);

    expect(decryptToken(encrypted1)).toBe(plainText);
    expect(decryptToken(encrypted2)).toBe(plainText);
  });

  it("throws an error if GIT_TOKEN_ENCRYPTION_KEY is not set", () => {
    delete process.env.GIT_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptToken("secret")).toThrow("GIT_TOKEN_ENCRYPTION_KEY environment variable is not set.");
    expect(() => decryptToken("iv:tag:cipher")).toThrow("GIT_TOKEN_ENCRYPTION_KEY environment variable is not set.");
  });

  it("throws an error if GIT_TOKEN_ENCRYPTION_KEY is not 32 bytes (64 hex characters)", () => {
    // Too short (31 bytes / 62 hex chars)
    process.env.GIT_TOKEN_ENCRYPTION_KEY = "a".repeat(62);
    expect(() => encryptToken("secret")).toThrow("GIT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");

    // Too long (33 bytes / 66 hex chars)
    process.env.GIT_TOKEN_ENCRYPTION_KEY = "b".repeat(66);
    expect(() => encryptToken("secret")).toThrow("GIT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  });

  it("throws an error if the encrypted token format is invalid", () => {
    // Missing parts
    expect(() => decryptToken("part1:part2")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("single_string")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("part1:part2:part3:part4")).toThrow("Invalid encrypted token format");
  });

  it("throws an error if initialization vector or tag length is invalid", () => {
    const wrongIv = "a".repeat(22); // 11 bytes hex
    const tag = "b".repeat(32); // 16 bytes hex
    const cipher = "c".repeat(10);
    expect(() => decryptToken(`${wrongIv}:${tag}:${cipher}`)).toThrow("Invalid initialization vector length.");

    const iv = "a".repeat(24); // 12 bytes hex
    const wrongTag = "b".repeat(30); // 15 bytes hex
    expect(() => decryptToken(`${iv}:${wrongTag}:${cipher}`)).toThrow("Invalid authentication tag length.");
  });

  it("throws an error if ciphertext or tag is tampered with", () => {
    const plainText = "sensitive_data";
    const encrypted = encryptToken(plainText);
    const [iv, tag, cipher] = encrypted.split(":");

    // Tamper with ciphertext
    const tamperedCipher = cipher.substring(0, cipher.length - 2) + (cipher.endsWith("0") ? "1" : "0");
    expect(() => decryptToken(`${iv}:${tag}:${tamperedCipher}`)).toThrow();

    // Tamper with tag
    const tamperedTag = tag.substring(0, tag.length - 2) + (tag.endsWith("0") ? "1" : "0");
    expect(() => decryptToken(`${iv}:${tamperedTag}:${cipher}`)).toThrow();
  });
});
