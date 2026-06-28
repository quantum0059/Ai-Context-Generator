import { z } from "zod";
import { MODELS, type AiModel } from "./ai-models";

/**
 * ContextForge AI engine: NVIDIA NIM API (Nemotron).
 * Uses the OpenAI-compatible chat completions endpoint at
 * https://integrate.api.nvidia.com/v1
 *
 * Supports extended thinking via `reasoning_budget` so the model can
 * plan before generating content — ideal for architectural generation tasks.
 *
 * All calls return schema-validated JSON with retries, matching the
 * claude.ts / groq.ts / xai.ts behaviour.
 */

export function isNvidiaConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const CONTENT_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_CONTENT_REQUEST_TIMEOUT_MS ?? 120_000,
);

function extractJson(text: string): string {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start =
    objStart === -1
      ? arrStart
      : arrStart === -1
        ? objStart
        : Math.min(objStart, arrStart);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end === -1 || end <= start)
    throw new Error("No JSON found in response");
  return text.slice(start, end + 1);
}

/**
 * Reads a streaming NVIDIA NIM response and accumulates the full content text.
 * The API returns Server-Sent Events (SSE); we skip `reasoning_content` chunks
 * and only accumulate the actual `content` deltas.
 */
async function readNvidiaStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("NVIDIA response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the incomplete trailing line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") break;

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
        };
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) content += delta.content;
        // reasoning_content is intentionally ignored — it's the thinking scratchpad
      } catch {
        // Ignore malformed SSE chunks
      }
    }
  }

  return content;
}

export async function nvidiaJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
  model: AiModel = MODELS.NVIDIA_DEFAULT,
): Promise<T> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured");

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Generator] NVIDIA NIM using model: ${model} (attempt ${attempt + 1})`);

      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(CONTENT_REQUEST_TIMEOUT_MS),
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
          temperature: 1,
          top_p: 0.95,
          max_tokens: 16384,
          stream: true,
          // Enable extended thinking — the model reasons before responding
          extra_body: {
            chat_template_kwargs: { enable_thinking: true },
            reasoning_budget: 8192,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`NVIDIA API error: ${res.status} ${errText}`);
      }

      const text = await readNvidiaStream(res);
      const parsed = schema.safeParse(JSON.parse(extractJson(text)));
      if (!parsed.success)
        throw new Error(`Schema validation failed: ${parsed.error.message}`);
      return parsed.data;
    } catch (err) {
      lastError = err;
      console.warn(`[Generator] NVIDIA attempt ${attempt + 1} failed:`, err);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("NVIDIA call failed");
}

export async function nvidiaText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
  model: AiModel = MODELS.NVIDIA_DEFAULT,
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured");

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Generator] NVIDIA NIM using model: ${model} (attempt ${attempt + 1})`);

      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(CONTENT_REQUEST_TIMEOUT_MS),
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
          temperature: 1,
          top_p: 0.95,
          max_tokens: 16384,
          stream: true,
          extra_body: {
            chat_template_kwargs: { enable_thinking: true },
            reasoning_budget: 8192,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`NVIDIA API error: ${res.status} ${errText}`);
      }

      return await readNvidiaStream(res);
    } catch (err) {
      lastError = err;
      console.warn(`[Generator] NVIDIA attempt ${attempt + 1} failed:`, err);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("NVIDIA text call failed");
}
