export const MODELS = {
  // Fast classification tasks only
  FAST: 'llama-3.1-8b-instant',

  // Primary content generation.
  // NOTE: the previous value 'qwen/qwen3.6-27b' is NOT a valid Groq model ID,
  // which caused every content call to fail and silently fall back to
  // heuristics. Use a known-good Groq production model.
  CONTENT: 'llama-3.3-70b-versatile',

  // Fallback if CONTENT hits rate limits or is unavailable
  CONTENT_FALLBACK: 'llama-3.1-8b-instant',

  // Complex reasoning: ADRs, dependency analysis,
  // constraint conflict detection
  REASONING: 'deepseek-r1-distill-llama-70b',

  // Defaults for the other supported provider gateways
  ANTHROPIC_DEFAULT: "claude-sonnet-4-20250514",
} as const;

export type AiModel = (typeof MODELS)[keyof typeof MODELS];
