export const MODELS = {
  // Fast classification tasks only
  FAST: 'llama-3.1-8b-instant',

  // Primary content generation
  // qwen3-32b is being deprecated on Groq —
  // qwen3.6-27b is the recommended replacement
  CONTENT: 'qwen/qwen3.6-27b',

  // Fallback if CONTENT hits rate limits
  CONTENT_FALLBACK: 'llama-3.3-70b-versatile',

  // Complex reasoning: ADRs, dependency analysis,
  // constraint conflict detection
  REASONING: 'deepseek-r1-distill-llama-70b',

  // Defaults for the other supported provider gateways
  ANTHROPIC_DEFAULT: "claude-sonnet-4-20250514",
} as const;

export type AiModel = (typeof MODELS)[keyof typeof MODELS];
