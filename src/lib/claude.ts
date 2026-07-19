import { z } from "zod";
import { type AiModel } from "./ai-models";
import { getProvider, isProviderConfigured } from "./ai-provider";

/**
 * ContextForge AI engine — backward-compatible facade over the AIProvider abstraction.
 *
 * All generators continue to call `claudeJson`, `claudeText`, and `isClaudeConfigured`
 * from this file. Internally, calls are dispatched to whichever provider is active
 * (Anthropic, Groq, or Ollama) — determined once at startup by `getProvider()`.
 *
 * To add a new AI backend, implement `AIProvider` in `src/lib/ai-provider.ts`.
 * No changes to this file or any generator are required.
 */

/** Returns true if ANY AI backend is configured and ready. */
export function isClaudeConfigured(): boolean {
  return isProviderConfigured();
}

/**
 * Sends a structured prompt to the active AI provider and validates the
 * response against the given Zod schema.
 *
 * Falls back to the next provider automatically (Anthropic → Groq → Ollama).
 */
export async function claudeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  retries = 2,
  model: AiModel | undefined = undefined,
  maxTokens?: number,
): Promise<T> {
  return getProvider().json(systemPrompt, userPrompt, schema, retries, model, maxTokens);
}

/**
 * Sends a prompt to the active AI provider and returns the raw text response.
 */
export async function claudeText(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
  model: AiModel | undefined = undefined,
): Promise<string> {
  return getProvider().text(systemPrompt, userPrompt, retries, model);
}
