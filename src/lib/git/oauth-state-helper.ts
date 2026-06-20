import crypto from "crypto";

/**
 * Shared CSRF state generation and validation for OAuth flows.
 *
 * The state token encodes the userId (for binding the connection) and a
 * random nonce (for CSRF protection), signed with HMAC-SHA256 using the
 * GIT_TOKEN_ENCRYPTION_KEY to prevent tampering.
 *
 * Format: base64url(JSON({ userId, nonce, ts })) + "." + hmacHex
 */

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function getSigningKey(): string {
  const key = process.env.GIT_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("GIT_TOKEN_ENCRYPTION_KEY environment variable is not set.");
  }
  return key;
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", getSigningKey()).update(data).digest("hex");
}

/** Generates a tamper-proof CSRF state token for OAuth redirects. */
export function generateOAuthState(userId: string): string {
  const payload = JSON.stringify({
    userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    ts: Date.now(),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = hmac(encoded);
  return `${encoded}.${signature}`;
}

/**
 * Validates an OAuth state token and returns the embedded userId.
 * Throws if the token is invalid, tampered with, or expired.
 */
export function validateOAuthState(state: string): { userId: string } {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex === -1) {
    throw new Error("Invalid OAuth state format.");
  }

  const encoded = state.slice(0, dotIndex);
  const signature = state.slice(dotIndex + 1);

  if (hmac(encoded) !== signature) {
    throw new Error("OAuth state signature mismatch — possible CSRF attack.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    userId: string;
    nonce: string;
    ts: number;
  };

  if (Date.now() - payload.ts > STATE_MAX_AGE_MS) {
    throw new Error("OAuth state expired. Please try connecting again.");
  }

  return { userId: payload.userId };
}
