import { z } from "zod";
import { MODELS } from "./ai-models";

/**
 * ContextForge AI engine: xAI (Grok) API.
 * Uses the OpenAI-compatible chat completions endpoint.
 * All calls return schema-validated JSON with retries.
 */

export function isXaiConfigured(): boolean {
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

export async function xaiJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
): Promise<T> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = process.env.XAI_MODEL ?? MODELS.XAI_DEFAULT;

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
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `${userPrompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`xAI API error: ${res.status}`);
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
  throw lastError instanceof Error ? lastError : new Error("xAI call failed");
}

export async function xaiText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");
  const model = process.env.XAI_MODEL ?? MODELS.XAI_DEFAULT;

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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`xAI API error: ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("xAI text call failed");
}
