import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateOAuthState, validateOAuthState } from "../src/lib/git/oauth-state-helper";

describe("oauth-state-helper", () => {
  const TEST_KEY = "a".repeat(64); // valid 64-char hex string

  beforeEach(() => {
    vi.stubEnv("GIT_TOKEN_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips: generate → validate returns the same userId", () => {
    const state = generateOAuthState("user_123");
    const result = validateOAuthState(state);
    expect(result.userId).toBe("user_123");
  });

  it("generates unique states for the same userId (nonce differs)", () => {
    const state1 = generateOAuthState("user_123");
    const state2 = generateOAuthState("user_123");
    expect(state1).not.toBe(state2);
  });

  it("rejects tampered state (modified payload)", () => {
    const state = generateOAuthState("user_123");
    const [encoded, sig] = state.split(".");
    // Flip a character in the encoded payload
    const tampered = (encoded[0] === "a" ? "b" : "a") + encoded.slice(1);
    expect(() => validateOAuthState(`${tampered}.${sig}`)).toThrow("signature mismatch");
  });

  it("rejects tampered state (modified signature)", () => {
    const state = generateOAuthState("user_123");
    const dotIndex = state.lastIndexOf(".");
    const encoded = state.slice(0, dotIndex);
    expect(() => validateOAuthState(`${encoded}.badhex`)).toThrow("signature mismatch");
  });

  it("rejects malformed state (no dot separator)", () => {
    expect(() => validateOAuthState("nodot")).toThrow("Invalid OAuth state format");
  });

  it("rejects expired state (older than 10 minutes)", () => {
    // Generate a state, then advance time past the 10-minute window
    const state = generateOAuthState("user_123");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000); // 11 minutes later
    expect(() => validateOAuthState(state)).toThrow("expired");
    vi.useRealTimers();
  });

  it("throws when GIT_TOKEN_ENCRYPTION_KEY is not set", () => {
    vi.stubEnv("GIT_TOKEN_ENCRYPTION_KEY", "");
    expect(() => generateOAuthState("user_123")).toThrow("GIT_TOKEN_ENCRYPTION_KEY");
  });
});
