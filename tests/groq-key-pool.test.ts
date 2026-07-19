import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";

import { GROQ_API_KEYS } from "../src/config/groq-keys";
import {
  callGroqJsonWithKey,
  estimateGroqRequestTokens,
  GroqApiError,
  GroqKeyPool,
  MODEL_LIMITS,
} from "../src/contextforge/groq-key-pool";
import { MODELS } from "../src/lib/ai-models";

const schema = z.object({
  status: z.string(),
});

const systemPrompt = [
  "You are a JSON API.",
  'Return exactly one JSON object: {"status":"ok"}',
  "Do not include markdown, prose, or any extra keys.",
].join(" ");
const userPrompt = [
  'Return a JSON object with one string field named "status".',
  'The value must be exactly "ok".',
  'Output only {"status":"ok"}.',
].join(" ");
const model = MODELS.CONTENT;
const maxTokens = 120;
const estimatedTokens = estimateGroqRequestTokens(systemPrompt, userPrompt, maxTokens);
const originalFastLimit = MODEL_LIMITS[model];

beforeEach(() => {
  MODEL_LIMITS[model] = 500;
});

afterEach(() => {
  MODEL_LIMITS[model] = originalFastLimit;
  vi.restoreAllMocks();
});

test(
  "rotates to a different key when the first key is saturated and a 429 occurs",
  async () => {
    expect(GROQ_API_KEYS.length).toBeGreaterThanOrEqual(2);

    const keys = GROQ_API_KEYS.slice(0, 2);
    const selectionPool = new GroqKeyPool(keys);
    const firstKey = selectionPool.selectKey(model, estimatedTokens);

    expect(firstKey).toBe(keys[0]);

    const initialResult = await selectionPool.callWithRotation(
      model,
      estimatedTokens,
      (apiKey) =>
        callGroqJsonWithKey({
          apiKey,
          systemPrompt,
          userPrompt,
          schema,
          model,
          maxTokens,
        }),
    );

    expect(initialResult.status).toBe("ok");

    selectionPool.recordUsage(firstKey!, model, 450);
    const nextKey = selectionPool.selectKey(model, estimatedTokens);
    expect(nextKey).toBe(keys[1]);

    const rotationPool = new GroqKeyPool(keys);
    const originalLog = console.log;
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
      originalLog(...args);
    });

    const rotatedResult = await rotationPool.callWithRotation(
      model,
      estimatedTokens,
      async (apiKey) => {
        const result = await callGroqJsonWithKey({
          apiKey,
          systemPrompt,
          userPrompt,
          schema,
          model,
          maxTokens,
        });

        if (apiKey === keys[0]) {
          throw new GroqApiError(
            "Forced 429 after successful live call on the first key",
            429,
            1000,
            "forced-by-test",
          );
        }

        return result;
      },
    );

    expect(rotatedResult.status).toBe("ok");
    expect(
      logSpy.mock.calls.some((call) =>
        String(call[0]).includes("[GroqKeyPool] 429 on key"),
      ),
    ).toBe(true);
  },
  60_000,
);
