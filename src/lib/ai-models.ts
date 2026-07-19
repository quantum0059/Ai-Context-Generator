// ─── Groq model IDs ───────────────────────────────────────────────────────────
//
// Always verify against: https://console.groq.com/docs/models
// and check for upcoming deprecations: https://console.groq.com/docs/deprecations
//
// Last audited: 2026-07-17
//   • deepseek-r1-distill-llama-70b  — decommissioned 2025-10-02
//     Replaced by: openai/gpt-oss-120b  (Groq official recommendation)
//   • llama-3.3-70b-versatile        — deprecated, shutdown 2026-08-16
//     Replaced by: openai/gpt-oss-120b
//   • llama-3.1-8b-instant           — deprecated, shutdown 2026-08-16
//     Replaced by: openai/gpt-oss-20b

export const MODELS = {
  // Fast classification and lightweight tasks.
  // Replaces: llama-3.1-8b-instant (deprecated 2026-08-16)
  FAST: 'openai/gpt-oss-20b',

  // Primary content generation.
  // Replaces: llama-3.3-70b-versatile (deprecated 2026-08-16)
  CONTENT: 'openai/gpt-oss-120b',

  // Fallback if CONTENT hits rate limits or is unavailable.
  // Replaces: llama-3.1-8b-instant (deprecated 2026-08-16)
  CONTENT_FALLBACK: 'openai/gpt-oss-20b',

  // Complex reasoning: project classification, ADRs, dependency analysis,
  // constraint conflict detection.
  // Replaces: deepseek-r1-distill-llama-70b (decommissioned 2025-10-02)
  REASONING: 'openai/gpt-oss-120b',

  // Defaults for the Anthropic provider gateway
  ANTHROPIC_DEFAULT: "claude-sonnet-4-20250514",
} as const;

export type AiModel = (typeof MODELS)[keyof typeof MODELS];
