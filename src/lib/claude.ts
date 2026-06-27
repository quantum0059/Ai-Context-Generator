import { z } from "zod";
import { groqJson, groqText, isGroqConfigured } from "./groq";
import { xaiJson, xaiText, isXaiConfigured } from "./xai";

/**
 * ContextForge AI engine: unified provider gateway.
 *
 * Priority order:
 *   1. Anthropic Claude (ANTHROPIC_API_KEY)
 *   2. Groq            (GROQ_API_KEY)
 *   3. No AI — callers fall back to deterministic heuristics
 *
 * All callers import `isClaudeConfigured` and `claudeJson` from this file.
 * The function names are kept for backward compatibility — they dispatch to
 * whichever provider is configured.
 */

/** Returns true if ANY AI backend (Claude or Groq) is configured. */
export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || isGroqConfigured() || isXaiConfigured();
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
  prompt: string,
  schema: z.ZodType<T>,
  retries = 2,
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

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
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
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
  prompt: string,
  retries = 2,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

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
          messages: [
            {
              role: "user",
              content: prompt,
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
 * against the given Zod schema. Tries Claude first, then Groq.
 *
 * All callers import this as `claudeJson` for backward compatibility.
 */
export async function claudeJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  retries = 2,
): Promise<T> {
  // Prefer Claude when available
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaude(prompt, schema, retries);
  }
  // Try xAI
  if (isXaiConfigured()) {
    return xaiJson(prompt, schema, retries);
  }
  // Fallback to Groq
  if (isGroqConfigured()) {
    return groqJson(prompt, schema, retries);
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY, GROQ_API_KEY, or XAI_API_KEY.");
}

/**
 * Sends a prompt to the configured AI provider and returns the raw text response.
 */
export async function claudeText(
  prompt: string,
  retries = 2,
): Promise<string> {
  // Prefer Claude when available
  if (process.env.ANTHROPIC_API_KEY) {
    return callClaudeText(prompt, retries);
  }
  // Try xAI
  if (isXaiConfigured()) {
    return xaiText(prompt, retries);
  }
  // Fallback to Groq
  if (isGroqConfigured()) {
    return groqText(prompt, retries);
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY, GROQ_API_KEY, or XAI_API_KEY.");
}

