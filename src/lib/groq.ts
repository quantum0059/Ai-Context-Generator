/**
 * ContextForge AI engine: Groq API.
 * Uses the OpenAI-compatible chat completions endpoint.
 * All calls return schema-validated JSON with retries, matching claude.ts behaviour.
 *
 * 429 handling: reads the Retry-After header (seconds) from Groq's response and
 * waits that long before retrying. If no header is present, uses exponential
 * backoff (1 s → 2 s → 4 s). After MAX_429_RETRIES exhausted, falls back to the
 * secondary model. This logic lives here so every caller gets it automatically.
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

// ─── Zod → JSON Schema converter ─────────────────────────────────────────────
function zodToJsonSchema(schema: z.ZodTypeAny): object {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, object> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val as z.ZodTypeAny);
      required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element) };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: (schema as z.ZodEnum<[string, ...string[]]>).options };
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodCatch) {
    return zodToJsonSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodUnion) {
    return { anyOf: (schema.options as z.ZodTypeAny[]).map(zodToJsonSchema) };
  }
  return {};
}

const FAST_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 15_000);
const CONTENT_REQUEST_TIMEOUT_MS = Number(process.env.AI_CONTENT_REQUEST_TIMEOUT_MS ?? 90_000);
const GROQ_DEFAULT_MODEL = (process.env.GROQ_MODEL as AiModel | undefined) ?? MODELS.CONTENT;
const GROQ_REASONING_MODEL =
  (process.env.GROQ_REASONING_MODEL as AiModel | undefined) ?? GROQ_DEFAULT_MODEL;

function requestTimeout(model: AiModel): number {
  return model === MODELS.FAST ? FAST_REQUEST_TIMEOUT_MS : CONTENT_REQUEST_TIMEOUT_MS;
}

function resolveGroqModel(model: AiModel): AiModel {
  // GROQ_REASONING_MODEL env var allows overriding the reasoning model at deploy
  // time (e.g. to use a different model for reasoning tasks) without code changes.
  // When REASONING and CONTENT share the same literal (both are openai/gpt-oss-120b),
  // the GROQ_REASONING_MODEL env allows independent control.
  if (process.env.GROQ_REASONING_MODEL && model === (MODELS.REASONING as string)) {
    return process.env.GROQ_REASONING_MODEL as AiModel;
  }
  if (model === MODELS.CONTENT) return GROQ_DEFAULT_MODEL;
  return model;
}

/** Maximum number of 429-specific retries before switching to the fallback model. */
const MAX_429_RETRIES = 3;

/**
 * Waits the duration specified by the Retry-After header (if present) or uses
 * exponential backoff (1 s, 2 s, 4 s, …) capped at 16 s.
 */
async function wait429(response: Response, attempt: number): Promise<void> {
  const retryAfterHeader = response.headers.get("retry-after");
  let delayMs: number;
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    delayMs = isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1000, 30_000)   // honour header, cap at 30 s
      : Math.min(1000 * 2 ** attempt, 16_000);
  } else {
    // Exponential backoff: 1 s → 2 s → 4 s → 8 s → …
    delayMs = Math.min(1000 * 2 ** attempt, 16_000);
  }
  console.warn(`[Groq] 429 rate-limited — waiting ${delayMs}ms before retry (attempt ${attempt + 1}/${MAX_429_RETRIES})`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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

  let responseFormat: object;
  try {
    const jsonSchema = zodToJsonSchema(schema);
    const hasProperties = "properties" in jsonSchema;
    responseFormat = { type: "json_object" };
  } catch {
    responseFormat = { type: "json_object" };
  }

  // ── 429-specific retry loop (before the schema-validation retry loop) ───────
  for (let rateAttempt = 0; rateAttempt < MAX_429_RETRIES; rateAttempt++) {
    let res: Response;
    try {
      if (
        activeModel === GROQ_DEFAULT_MODEL ||
        activeModel === MODELS.CONTENT_FALLBACK
      ) {
        console.log(`[Generator] Using model: ${activeModel}`);
      }
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
              content: `${userPrompt}\n\nIMPORTANT: You MUST include ALL fields in the JSON response, even if the value is an empty array []. Never omit any key from the schema.`,
            },
          ],
          response_format: responseFormat,
          temperature: 0,
          max_tokens: maxTokens ?? ((activeModel as string) === MODELS.FAST || (activeModel as string) === MODELS.CONTENT_FALLBACK ? 1024 : 4096),
        }),
      });
    } catch (err) {
      // Network-level error (timeout, connection reset, etc.) — not a 429
      lastError = err;
      break;
    }

    // ── 429: wait and retry on the same model ─────────────────────────────────
    if (res.status === 429) {
      if (rateAttempt < MAX_429_RETRIES - 1) {
        await wait429(res, rateAttempt);
        continue; // retry
      }
      // All 429 retries exhausted → fall through to secondary-model fallback below
      console.warn(`[Generator] ${activeModel} still 429 after ${MAX_429_RETRIES} retries — switching to fallback model`);
      const isDefaultModel =
        activeModel === GROQ_DEFAULT_MODEL &&
        activeModel !== MODELS.CONTENT_FALLBACK;
      if (isDefaultModel) {
        return groqJson(systemPrompt, userPrompt, schema, 0, MODELS.CONTENT_FALLBACK);
      }
      throw new Error(`Groq API error: 429 — rate limit exceeded after ${MAX_429_RETRIES} retries`);
    }

    // ── Non-429 HTTP error → fall back to secondary model (400/404) or throw ──
    if (!res.ok) {
      const shouldFallback =
        (res.status === 400 || res.status === 404) &&
        activeModel === GROQ_DEFAULT_MODEL &&
        activeModel !== MODELS.CONTENT_FALLBACK;
      if (shouldFallback) {
        console.warn(`[Generator] ${GROQ_DEFAULT_MODEL} unavailable (status ${res.status}); retrying with ${MODELS.CONTENT_FALLBACK}`);
        return groqJson(systemPrompt, userPrompt, schema, 0, MODELS.CONTENT_FALLBACK);
      }
      throw new Error(`Groq API error: ${res.status}`);
    }

    // ── Successful response — parse and validate with schema-retry loop ────────
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        const parsed = schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
        return parsed.data;
      } catch (err) {
        lastError = err;
        // Schema validation errors don't benefit from re-fetching within the
        // same response body — break out and let the outer 429 loop re-request.
        break;
      }
    }
    // If we reach here, schema validation failed — try a fresh request
    continue;
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

  // ── 429-specific retry loop ──────────────────────────────────────────────────
  for (let rateAttempt = 0; rateAttempt < MAX_429_RETRIES; rateAttempt++) {
    let res: Response;
    try {
      if (
        activeModel === GROQ_DEFAULT_MODEL ||
        activeModel === MODELS.CONTENT_FALLBACK
      ) {
        console.log(`[Generator] Using model: ${activeModel}`);
      }
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    } catch (err) {
      lastError = err;
      break;
    }

    // ── 429: wait and retry ───────────────────────────────────────────────────
    if (res.status === 429) {
      if (rateAttempt < MAX_429_RETRIES - 1) {
        await wait429(res, rateAttempt);
        continue;
      }
      console.warn(`[Generator] ${activeModel} still 429 after ${MAX_429_RETRIES} retries — switching to fallback model`);
      const isDefaultModel =
        activeModel === GROQ_DEFAULT_MODEL &&
        activeModel !== MODELS.CONTENT_FALLBACK;
      if (isDefaultModel) {
        return groqText(systemPrompt, userPrompt, 0, MODELS.CONTENT_FALLBACK);
      }
      throw new Error(`Groq API error: 429 — rate limit exceeded after ${MAX_429_RETRIES} retries`);
    }

    if (!res.ok) {
      const shouldFallback =
        (res.status === 400 || res.status === 404) &&
        activeModel === GROQ_DEFAULT_MODEL &&
        activeModel !== MODELS.CONTENT_FALLBACK;
      if (shouldFallback) {
        console.warn(`[Generator] ${GROQ_DEFAULT_MODEL} unavailable (status ${res.status}); retrying with ${MODELS.CONTENT_FALLBACK}`);
        return groqText(systemPrompt, userPrompt, 0, MODELS.CONTENT_FALLBACK);
      }
      throw new Error(`Groq API error: ${res.status}`);
    }

    // ── Successful response ───────────────────────────────────────────────────
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content ?? "";
      } catch (err) {
        lastError = err;
        break;
      }
    }
    continue;
  }

  throw lastError instanceof Error ? lastError : new Error("Groq text call failed");
}
