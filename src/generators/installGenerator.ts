import type { GeneratedPackage, ProjectInput, Recommendation } from "../types";

/** Generates install.sh, install.ps1, install-guide.md and project-bootstrap.md. */
export function generateInstall(
  input: ProjectInput,
  selected: Recommendation[],
): GeneratedPackage {
  const commands = Array.from(
    new Set(selected.flatMap((r) => r.primary.installCommands)),
  );
  const envVars = Array.from(new Set(selected.flatMap((r) => r.primary.envVars)));

  return {
    "setup/install.sh": `#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies for ${input.name}..."
${commands.join("\n")}
echo "Done. Copy .env.example to .env and fill in the required variables."
`,
    "setup/install.ps1": `Write-Host "Installing dependencies for ${input.name}..."
${commands.join("\n")}
Write-Host "Done. Copy .env.example to .env and fill in the required variables."
`,
    "setup/install-guide.md": `# Install Guide: ${input.name}

## 1. Prerequisites
- Node.js 20+
- npm 10+

## 2. Install dependencies
Run \`setup/install.sh\` (macOS/Linux) or \`setup/install.ps1\` (Windows), or run manually:

\`\`\`bash
${commands.join("\n")}
\`\`\`

## 3. Environment variables
Create a \`.env\` file with:

\`\`\`
${envVars.map((v) => `${v}=`).join("\n") || "# No environment variables required"}
\`\`\`

## 4. Verify
Run the dev server and the test suite before starting feature work.
`,
    "setup/project-bootstrap.md": `# Project Bootstrap: ${input.name}

1. Initialize the project for platform **${input.platform}** using the framework from \`ai-context.json\`.
2. Run the install script in \`setup/\`.
3. Copy \`agents.md\` into the new repository root.
4. Copy \`prompts/\`, \`skills/\`, \`templates/\` and \`decisions/\` into the repo (e.g. under \`docs/ai/\`).
5. Start with \`prompts/01-project-analysis.md\` in your AI assistant, then follow the roadmap phase by phase.
`,
  };
}
