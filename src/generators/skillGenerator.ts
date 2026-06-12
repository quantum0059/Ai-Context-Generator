import type { Technology } from "../types";

/** Generates a reusable skill file for one technology. */
export function generateSkill(tech: Technology): string {
  return `# Skill: ${tech.name}

## Overview
${tech.description}

- **Category:** ${tech.category}
- **Pricing:** ${tech.pricing}
- **Free tier:** ${tech.freeTier ? "Yes" : "No"}
- **Documentation:** ${tech.docsUrl}

## Installation
\`\`\`bash
${tech.installCommands.join("\n")}
\`\`\`

## Environment Variables
${tech.envVars.length > 0 ? tech.envVars.map((v) => `- \`${v}\``).join("\n") : "_None required._"}

## Best Practices
${tech.pros.map((p) => `- Leverage: ${p}`).join("\n")}
- Keep all secrets in environment variables; never commit them.
- Wrap all SDK calls in a thin service layer so the dependency stays swappable.

## Common Mistakes
${tech.cons.map((c) => `- Watch out for: ${c}`).join("\n")}
- Do not scatter direct SDK calls across components; route them through the service layer.

## Integration Notes
Consult the official documentation (${tech.docsUrl}) for framework-specific
integration guides. Validate configuration at startup and fail fast when a
required environment variable is missing.
`;
}
