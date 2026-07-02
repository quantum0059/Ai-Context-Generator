/**
 * ContextForge AI engine: Groq API.
 * Uses the OpenAI-compatible chat completions endpoint.
 * All calls return schema-validated JSON with retries, matching claude.ts behaviour.
 */

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
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
import { MODELS, type AiModel } from "./ai-models";

const FAST_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 15_000);
const CONTENT_REQUEST_TIMEOUT_MS = Number(process.env.AI_CONTENT_REQUEST_TIMEOUT_MS ?? 90_000);
const GROQ_DEFAULT_MODEL = (process.env.GROQ_MODEL as AiModel | undefined) ?? MODELS.CONTENT;
const GROQ_REASONING_MODEL =
  (process.env.GROQ_REASONING_MODEL as AiModel | undefined) ?? GROQ_DEFAULT_MODEL;

function requestTimeout(model: AiModel): number {
  return model === MODELS.FAST ? FAST_REQUEST_TIMEOUT_MS : CONTENT_REQUEST_TIMEOUT_MS;
}

function resolveGroqModel(model: AiModel): AiModel {
  if (model === MODELS.CONTENT) return GROQ_DEFAULT_MODEL;
  if (model === MODELS.REASONING) return GROQ_REASONING_MODEL;
  return model;
}

export async function groqJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
  model: AiModel = MODELS.CONTENT,
): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  let lastError: unknown;
  let activeModel: AiModel = resolveGroqModel(model);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (
        activeModel === GROQ_DEFAULT_MODEL ||
        activeModel === MODELS.CONTENT_FALLBACK
      ) {
        console.log(`[Generator] Using model: ${activeModel}`);
      }
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeout(activeModel)),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel,
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
      if (!res.ok) {
        // Fall back to the secondary model on rate limits (429) AND on
        // model/availability errors (400/404). A bad or deprecated model ID
        // must degrade gracefully instead of silently killing AI generation.
        const shouldFallback =
          (res.status === 429 || res.status === 400 || res.status === 404) &&
          activeModel === GROQ_DEFAULT_MODEL &&
          activeModel !== MODELS.CONTENT_FALLBACK;
        if (shouldFallback) {
          console.warn(`[Generator] ${GROQ_DEFAULT_MODEL} unavailable (status ${res.status}); retrying with ${MODELS.CONTENT_FALLBACK}`);
          return groqJson(systemPrompt, userPrompt, schema, 0, MODELS.CONTENT_FALLBACK);
        }
        throw new Error(`Groq API error: ${res.status}`);
      }
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
  throw lastError instanceof Error ? lastError : new Error("Groq call failed");
}

export async function groqText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
  model: AiModel = MODELS.CONTENT,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  let lastError: unknown;
  let activeModel: AiModel = resolveGroqModel(model);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (
        activeModel === GROQ_DEFAULT_MODEL ||
        activeModel === MODELS.CONTENT_FALLBACK
      ) {
        console.log(`[Generator] Using model: ${activeModel}`);
      }
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeout(activeModel)),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
        }),
      });
      if (!res.ok) {
        const shouldFallback =
          (res.status === 429 || res.status === 400 || res.status === 404) &&
          activeModel === GROQ_DEFAULT_MODEL &&
          activeModel !== MODELS.CONTENT_FALLBACK;
        if (shouldFallback) {
          console.warn(`[Generator] ${GROQ_DEFAULT_MODEL} unavailable (status ${res.status}); retrying with ${MODELS.CONTENT_FALLBACK}`);
          return groqText(systemPrompt, userPrompt, 0, MODELS.CONTENT_FALLBACK);
        }
        throw new Error(`Groq API error: ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq text call failed");
}
