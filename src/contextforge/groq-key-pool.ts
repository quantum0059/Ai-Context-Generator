import { z } from "zod";
import { GROQ_API_KEYS } from "../config/groq-keys";
import { MODELS, type AiModel } from "../lib/ai-models";

const WINDOW_MS = 60_000;
const JSON_VALIDATION_RETRIES = 2;

// Verified against Groq's official rate-limit page on July 19, 2026:
// https://console.groq.com/docs/rate-limits
export const MODEL_LIMITS: Record<string, number> = {
  [MODELS.CONTENT]: 8_000,
  [MODELS.FAST]: 8_000,
};

type UsageEntry = {
  timestamp: number;
  tokensUsed: number;
};

type SaturationState = {
  until: number;
  reason: string;
};

export class GroqApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
    readonly responseText?: string,
  ) {
    super(message);
    this.name = "GroqApiError";
  }
}

export class GroqKeyPool {
  private readonly usage = new Map<string, UsageEntry[]>();
  private readonly saturated = new Map<string, SaturationState>();

  constructor(
    private readonly keys: string[] = GROQ_API_KEYS,
    private readonly windowMs: number = WINDOW_MS,
  ) {}

  selectKey(model: AiModel, estimatedTokens: number): string | null {
    const candidates = this.rankKeys(model, estimatedTokens, new Set());
    return candidates[0] ?? null;
  }

  recordUsage(key: string, model: AiModel, tokensUsed: number): void {
    const usageKey = this.usageKey(key, model);
    const entries = this.usage.get(usageKey) ?? [];
    entries.push({ timestamp: Date.now(), tokensUsed });
    this.usage.set(usageKey, entries);
    this.prune(model, key);
  }

  async callWithRotation<T>(
    model: AiModel,
    estimatedTokens: number,
    fn: (apiKey: string) => Promise<{ value: T; tokensUsed?: number }>,
  ): Promise<T> {
    const attempted = new Set<string>();
    let lastError: unknown;

    while (attempted.size < this.keys.length) {
      const nextKey = this.rankKeys(model, estimatedTokens, attempted)[0];
      if (!nextKey) break;

      attempted.add(nextKey);

      try {
        const result = await fn(nextKey);
        if (typeof result.tokensUsed === "number" && result.tokensUsed > 0) {
          this.recordUsage(nextKey, model, result.tokensUsed);
        }
        return result.value;
      } catch (error) {
        lastError = error;

        if (error instanceof GroqApiError && error.status === 429) {
          const retryAfterMs = error.retryAfterMs ?? this.windowMs;
          this.markSaturated(nextKey, model, retryAfterMs, "429 rate limit");
          const fallbackKey = this.rankKeys(model, estimatedTokens, attempted)[0];
          if (fallbackKey) {
            console.log(
              `[GroqKeyPool] 429 on key ${this.maskKey(nextKey)} for ${model}; rotating to ${this.maskKey(fallbackKey)}`,
            );
            continue;
          }
        }

        throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`All Groq API keys are saturated for model ${model}.`);
  }

  private rankKeys(
    model: AiModel,
    estimatedTokens: number,
    excluded: Set<string>,
  ): string[] {
    const now = Date.now();
    return this.keys
      .filter((key) => !excluded.has(key))
      .filter((key) => !this.isSaturated(key, model, now))
      .map((key) => ({
        key,
        headroom: this.headroom(key, model, now),
      }))
      .filter((entry) => entry.headroom >= estimatedTokens)
      .sort((a, b) => b.headroom - a.headroom)
      .map((entry) => entry.key);
  }

  private markSaturated(
    key: string,
    model: AiModel,
    retryAfterMs: number,
    reason: string,
  ): void {
    this.saturated.set(this.usageKey(key, model), {
      until: Date.now() + Math.max(retryAfterMs, 1_000),
      reason,
    });
  }

  private headroom(key: string, model: AiModel, now: number): number {
    const limit = MODEL_LIMITS[model] ?? MODEL_LIMITS[MODELS.CONTENT];
    return limit - this.usedTokens(key, model, now);
  }

  private usedTokens(key: string, model: AiModel, now: number): number {
    this.prune(model, key, now);
    const entries = this.usage.get(this.usageKey(key, model)) ?? [];
    return entries.reduce((sum, entry) => sum + entry.tokensUsed, 0);
  }

  private isSaturated(key: string, model: AiModel, now: number): boolean {
    const state = this.saturated.get(this.usageKey(key, model));
    if (!state) return false;
    if (state.until <= now) {
      this.saturated.delete(this.usageKey(key, model));
      return false;
    }
    return true;
  }

  private prune(model: AiModel, key: string, now: number = Date.now()): void {
    const usageKey = this.usageKey(key, model);
    const entries = this.usage.get(usageKey);
    if (!entries) return;
    const fresh = entries.filter((entry) => now - entry.timestamp < this.windowMs);
    if (fresh.length === 0) this.usage.delete(usageKey);
    else this.usage.set(usageKey, fresh);
  }

  private usageKey(key: string, model: AiModel): string {
    return `${key}:${model}`;
  }

  private maskKey(key: string): string {
    return `...${key.slice(-6)}`;
  }
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

export function estimateGroqRequestTokens(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): number {
  const promptChars = systemPrompt.length + userPrompt.length;
  return Math.ceil(promptChars / 4) + maxTokens;
}

export async function callGroqJsonWithKey<T>({
  apiKey,
  systemPrompt,
  userPrompt,
  schema,
  retries = 0,
  model,
  maxTokens,
}: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  retries?: number;
  model: AiModel;
  maxTokens: number;
}): Promise<{ value: T; tokensUsed: number }> {
  let lastError: unknown;
  const jsonInstruction =
    'IMPORTANT: Return only valid JSON that follows the requested field contract. Optional fields may be omitted unless the prompt explicitly requires them; excludedCategories may be []; suggestedTools applies only to custom categories.';
  const strictJsonInstruction =
    'CRITICAL JSON-ONLY RETRY: Output exactly one JSON object. The first character must be { and the last character must be }. Do not include markdown, code fences, explanations, or any text outside the JSON object.';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    for (let jsonAttempt = 0; jsonAttempt <= JSON_VALIDATION_RETRIES; jsonAttempt += 1) {
      try {
        const isJsonRetry = jsonAttempt > 0;
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `${userPrompt}\n\n${jsonInstruction}${isJsonRetry ? `\n\n${strictJsonInstruction}` : ""}`,
            },
          ],
        };

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => response.statusText);
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
          const error = new GroqApiError(
            `Groq API error ${response.status}: ${responseText}`,
            response.status,
            retryAfterMs,
            responseText,
          );

          if (
            response.status === 400 &&
            responseText.includes("json_validate_failed")
          ) {
            if (jsonAttempt < JSON_VALIDATION_RETRIES) {
              console.log(
                `[GroqJSON] json_validate_failed for ${model}; retrying same key with response_format still enabled (${jsonAttempt + 1}/${JSON_VALIDATION_RETRIES}).`,
              );
              lastError = error;
              continue;
            }

            console.log(
              `[GroqJSON] json_validate_failed for ${model}; exhausted ${JSON_VALIDATION_RETRIES} same-key retries with response_format enabled.`,
            );
          }

          throw error;
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        const parsed = schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) {
          throw new Error(`Schema validation failed: ${parsed.error.message}`);
        }
        return {
          value: parsed.data,
          tokensUsed: data.usage?.total_tokens ?? maxTokens,
        };
      } catch (error) {
        lastError = error;
        if (error instanceof GroqApiError && error.status === 429) {
          throw error;
        }
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Groq JSON call failed");
}

export function shouldUseGroqKeyPool(): boolean {
  const explicitProvider = process.env.AI_PROVIDER?.toLowerCase();
  if (explicitProvider && explicitProvider !== "groq") return false;
  return GROQ_API_KEYS.length > 0;
}

export const groqKeyPool = new GroqKeyPool();
