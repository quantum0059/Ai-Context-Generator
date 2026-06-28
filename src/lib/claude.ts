import { z } from "zod";
import { groqJson, groqText, isGroqConfigured } from "./groq";
import { xaiJson, xaiText, isXaiConfigured } from "./xai";
import { nvidiaJson, nvidiaText, isNvidiaConfigured } from "./nvidia";
import { MODELS, type AiModel } from "./ai-models";

/**
 * ContextForge AI engine: unified provider gateway.
 *
 * Priority order:
 *   1. Anthropic Claude  (ANTHROPIC_API_KEY)
 *   2. xAI / Grok        (XAI_API_KEY)
 *   3. NVIDIA Nemotron   (NVIDIA_API_KEY)  ← primary fallback
 *   4. Groq              (GROQ_API_KEY)    ← last-resort fallback
 *   5. No AI — callers fall back to deterministic heuristics
 *
 * All callers import `isClaudeConfigured` and `claudeJson` from this file.
 * The function names are kept for backward compatibility — they dispatch to
 * whichever provider is configured.
 *
 * Every function accepts separate `systemPrompt` and `userPrompt` so that
 * architectural constraints are given the correct message priority at the
 * API level, regardless of which provider is in use.
 */

/** Returns true if ANY AI backend is configured. */
export function isClaudeConfigured(): boolean {
  return (
    Boolean(process.env.ANTHROPIC_API_KEY) ||
    isXaiConfigured() ||
    isNvidiaConfigured() ||
    isGroqConfigured()
  );
}

function extractJson(text: string): string {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start =
    objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON found in response");
  return text.slice(start, end + 1);
}

async function callClaude<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL ?? MODELS.ANTHROPIC_DEFAULT;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `${userPrompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? "";
      const parsed = schema.safeParse(JSON.parse(extractJson(text)));
      if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
      return parsed.data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Claude call failed");
}

async function callClaudeText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL ?? MODELS.ANTHROPIC_DEFAULT;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text ?? "";
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Claude text call failed");
}


/**
 * Sends a prompt to the configured AI provider and validates the response
 * against the given Zod schema. Tries Claude first, then xAI, then Groq.
 *
 * All callers import this as `claudeJson` for backward compatibility.
 */
export async function claudeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
  model: AiModel = MODELS.CONTENT,
): Promise<T> {
  // Prefer Claude when available
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(systemPrompt, userPrompt, schema, retries);
  }
  // Try xAI
  if (isXaiConfigured()) {
    return xaiJson(systemPrompt, userPrompt, schema, retries);
  }
  // Fallback to NVIDIA Nemotron (primary fallback)
  if (isNvidiaConfigured()) {
    return nvidiaJson(systemPrompt, userPrompt, schema, retries, model);
  }
  // Last-resort fallback to Groq
  if (isGroqConfigured()) {
    return groqJson(systemPrompt, userPrompt, schema, retries, model);
  }
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY, XAI_API_KEY, NVIDIA_API_KEY, or GROQ_API_KEY.",
  );
}

/**
 * Sends a prompt to the configured AI provider and returns the raw text response.
 */
export async function claudeText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
  model: AiModel = MODELS.CONTENT,
): Promise<string> {
  // Prefer Claude when available
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaudeText(systemPrompt, userPrompt, retries);
  }
  // Try xAI
  if (isXaiConfigured()) {
    return xaiText(systemPrompt, userPrompt, retries);
  }
  // Fallback to NVIDIA Nemotron (primary fallback)
  if (isNvidiaConfigured()) {
    return nvidiaText(systemPrompt, userPrompt, retries, model);
  }
  // Last-resort fallback to Groq
  if (isGroqConfigured()) {
    return groqText(systemPrompt, userPrompt, retries, model);
  }
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY, XAI_API_KEY, NVIDIA_API_KEY, or GROQ_API_KEY.",
  );
}
