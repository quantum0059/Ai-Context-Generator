/**
 * ContextForge AI engine: xAI Grok API.
 * Uses the OpenAI-compatible chat completions endpoint.
 * All calls return schema-validated JSON with retries, matching claude.ts behaviour.
 */

export function isGrokConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY);
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

import { z } from "zod";

export async function grokJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  retries = 2,
): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = process.env.XAI_MODEL ?? "grok-3-mini-fast";

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
            },
          ],
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`Grok API error: ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = schema.safeParse(JSON.parse(extractJson(text)));
      if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
      return parsed.data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Grok call failed");
}

export async function grokText(
  prompt: string,
  retries = 2,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = process.env.XAI_MODEL ?? "grok-3-mini-fast";

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`Grok API error: ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Grok text call failed");
}

