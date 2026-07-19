function loadGroqApiKeys(): string[] {
  const keys: string[] = [];

  const primaryKey = process.env.GROQ_API_KEY?.trim();
  if (primaryKey) {
    keys.push(primaryKey);
  }

  for (let index = 1; ; index += 1) {
    const value = process.env[`GROQ_API_KEY_${index}`]?.trim();
    if (!value) break;
    keys.push(value);
  }

  const dedupedKeys = Array.from(new Set(keys));

  if (dedupedKeys.length === 0) {
    throw new Error(
      "No Groq rotation keys found. Define GROQ_API_KEY and/or GROQ_API_KEY_1, GROQ_API_KEY_2, ... in the environment.",
    );
  }

  return dedupedKeys;
}

export const GROQ_API_KEYS = loadGroqApiKeys();
