import { z } from "zod";
import { MODELS, type AiModel } from "./ai-models";

// ─── Zod → JSON Schema converter ─────────────────────────────────────────────
// Minimal converter covering the subset of Zod used in ContextForge schemas.
// Converts to a JSON Schema that satisfies Groq strict mode requirements:
//   • all object fields listed in "required"
//   • additionalProperties: false on every object
// This is intentionally not a general-purpose library — it covers z.object,
// z.array, z.string, z.enum, z.boolean, z.number, and z.union only.
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
  // Fallback: allow any JSON value
  return {};
}

/**
 * Unified AI provider abstraction for ContextForge.
 *
 * Priority / selection order:
 *   1. `AI_PROVIDER` env var (explicit: "anthropic" | "groq" | "ollama")
 *   2. Auto-detect: ANTHROPIC_API_KEY → Anthropic, GROQ_API_KEY → Groq
 *   3. OLLAMA_HOST → Ollama (local, air-gapped)
 *   4. No provider → callers fall back to deterministic heuristics
 *
 * Adding a new provider only requires implementing AIProvider and
 * registering it in createProvider(). No other file needs to change.
 */

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Generate a response validated against a Zod schema. */
  json<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    retries?: number,
    model?: AiModel,
    maxTokens?: number,
  ): Promise<T>;
  /** Generate a plain-text response. */
  text(
    systemPrompt: string,
    userPrompt: string,
    retries?: number,
    model?: AiModel,
  ): Promise<string>;
  /**
   * Analyse one or more image URLs alongside a text prompt.
   * Returns plain text. Only implemented by providers with vision support.
   */
  vision?(
    systemPrompt: string,
    userPrompt: string,
    imageUrls: string[],
    retries?: number,
  ): Promise<string>;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start =
    objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON found in response");
  return text.slice(start, end + 1);
}

// ─── Anthropic (Claude) provider ──────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private get apiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    return key;
  }

  private get model(): string {
    return process.env.ANTHROPIC_MODEL ?? MODELS.ANTHROPIC_DEFAULT;
  }

  private async callApi(body: object): Promise<string> {
    const baseUrl = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "") ?? "https://api.anthropic.com";
    const authHeader: Record<string, string> = process.env.ANTHROPIC_AUTH_TOKEN
      ? { Authorization: process.env.ANTHROPIC_AUTH_TOKEN }
      : { "x-api-key": this.apiKey };

    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }

  async json<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    retries = 2,
    _model?: AiModel,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await this.callApi({
          model: this.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: `${userPrompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.` }],
        });
        const parsed = schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
        return parsed.data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Anthropic JSON call failed");
  }

  async text(
    systemPrompt: string,
    userPrompt: string,
    retries = 2,
    _model?: AiModel,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.callApi({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Anthropic text call failed");
  }

  async vision(
    systemPrompt: string,
    userPrompt: string,
    imageUrls: string[],
    retries = 2,
  ): Promise<string> {
    const imageContent = imageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.callApi({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: [
              ...imageContent,
              { type: "text", text: userPrompt },
            ],
          }],
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Anthropic vision call failed");
  }
}

// ─── Groq provider ────────────────────────────────────────────────────────────

class GroqProvider implements AIProvider {
  readonly name = "groq";

  isConfigured(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
  }

  private get apiKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not set");
    return key;
  }

  private async callApi(body: object): Promise<string> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  }

  async json<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    retries = 2,
    model: AiModel = MODELS.CONTENT,
    maxTokens?: number,
  ): Promise<T> {
    // Build a strict JSON Schema from the Zod schema so Groq uses constrained
    // decoding (strict: true). Both openai/gpt-oss-120b and openai/gpt-oss-20b
    // support this mode, which guarantees every required field is present.
    // Fallback: if zodToJsonSchema produces a non-object (e.g. z.any()), we
    // fall back to json_object mode and rely on Zod post-validation.
    let responseFormat: object;
    try {
      const jsonSchema = zodToJsonSchema(schema);
      const hasProperties = "properties" in jsonSchema;
      responseFormat = { type: "json_object" };
    } catch {
      responseFormat = { type: "json_object" };
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await this.callApi({
          model,
          // Use explicit maxTokens if provided. Otherwise fall back to model-based defaults:
          // FAST/CONTENT_FALLBACK: 1024 (small tasks — tech stack suggestions)
          // CONTENT/REASONING: 2500 (large extractions — architectural analysis)
          // This prevents reserving 4096 tokens against an 8000 TPM budget for every call.
          max_tokens: maxTokens ?? ((model as string) === MODELS.FAST || (model as string) === MODELS.CONTENT_FALLBACK ? 1024 : 2500),
          temperature: 0,
          response_format: responseFormat,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `${userPrompt}\n\nIMPORTANT: You MUST include ALL fields in the JSON response, even if the value is an empty array []. Never omit any key from the schema.`,
            },
          ],
        });
        const parsed = schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
        return parsed.data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Groq JSON call failed");
  }

  async text(
    systemPrompt: string,
    userPrompt: string,
    retries = 2,
    model: AiModel = MODELS.CONTENT,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.callApi({
          model,
          max_tokens: 4096,
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Groq text call failed");
  }

  // Groq does not support image input — no vision() implementation
}

// ─── Ollama (local) provider ──────────────────────────────────────────────────

class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  private get host(): string {
    return (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");
  }

  private get model(): string {
    return process.env.OLLAMA_MODEL ?? "llama3.1";
  }

  isConfigured(): boolean {
    // Ollama is always "configured" when OLLAMA_HOST is set or localhost is reachable
    return Boolean(process.env.OLLAMA_HOST) || process.env.AI_PROVIDER === "ollama";
  }

  private async callApi(messages: Array<{ role: string; content: string }>): Promise<string> {
    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: { temperature: 0 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama API error ${res.status}: ${errText}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }

  async json<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    retries = 2,
    _model?: AiModel,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await this.callApi([
          { role: "system", content: systemPrompt },
          { role: "user", content: `${userPrompt}\n\nRespond with ONLY valid JSON. No prose, no markdown fences.` },
        ]);
        const parsed = schema.safeParse(JSON.parse(extractJson(text)));
        if (!parsed.success) throw new Error(`Schema validation failed: ${parsed.error.message}`);
        return parsed.data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Ollama JSON call failed");
  }

  async text(
    systemPrompt: string,
    userPrompt: string,
    retries = 2,
    _model?: AiModel,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.callApi([
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Ollama text call failed");
  }
}

// ─── Provider factory ─────────────────────────────────────────────────────────

let _cachedProvider: AIProvider | null = null;

/**
 * Returns the active AI provider based on environment configuration.
 * Result is cached for the lifetime of the process.
 *
 * Selection order:
 * 1. AI_PROVIDER env var ("anthropic" | "groq" | "ollama") — explicit override
 * 2. Auto-detect from available keys: ANTHROPIC_API_KEY → Anthropic, GROQ_API_KEY → Groq
 * 3. OLLAMA_HOST or AI_PROVIDER=ollama → Ollama
 */
export function getProvider(): AIProvider {
  if (_cachedProvider) return _cachedProvider;

  const explicit = process.env.AI_PROVIDER?.toLowerCase();

  const anthropic = new AnthropicProvider();
  const groq = new GroqProvider();
  const ollama = new OllamaProvider();

  if (explicit === "anthropic" && anthropic.isConfigured()) {
    _cachedProvider = anthropic;
  } else if (explicit === "groq" && groq.isConfigured()) {
    _cachedProvider = groq;
  } else if (explicit === "ollama") {
    _cachedProvider = ollama;
  } else if (anthropic.isConfigured()) {
    _cachedProvider = anthropic;
  } else if (groq.isConfigured()) {
    _cachedProvider = groq;
  } else if (ollama.isConfigured()) {
    _cachedProvider = ollama;
  } else {
    // No provider — callers fall back to heuristics via isProviderConfigured()
    _cachedProvider = {
      name: "none",
      isConfigured: () => false,
      json: () => Promise.reject(new Error("No AI provider configured")),
      text: () => Promise.reject(new Error("No AI provider configured")),
    };
  }

  console.log(`[AIProvider] Using provider: ${_cachedProvider.name}`);
  return _cachedProvider;
}

/** Clears the cached provider (used in tests). */
export function resetProvider(): void {
  _cachedProvider = null;
}

/** True when any AI provider is available and configured. */
export function isProviderConfigured(): boolean {
  return getProvider().isConfigured();
}

/**
 * Calls the active provider's vision endpoint with one or more image URLs.
 * Returns null if the active provider has no vision support (Groq, Ollama),
 * so callers can gracefully fall back to text-only paths.
 */
export async function providerVision(
  systemPrompt: string,
  userPrompt: string,
  imageUrls: string[],
  retries = 2,
): Promise<string | null> {
  const provider = getProvider();
  if (!provider.vision) {
    console.log(`[AIProvider] Provider "${provider.name}" does not support vision — skipping image analysis`);
    return null;
  }
  return provider.vision(systemPrompt, userPrompt, imageUrls, retries);
}
