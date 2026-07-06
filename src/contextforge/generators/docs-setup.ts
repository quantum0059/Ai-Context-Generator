import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, buildConstraintBlock } from "./shared";
import { claudeText, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import { registryByName } from "../registry";

export async function generateSetup(spec: ProjectSpec, sharedContext: string = ''): Promise<PackageFiles> {
  const systemPrompt = `${buildConstraintBlock(spec)}You are a senior DevOps engineer generating project bootstrapping files. Every file must work correctly when executed against this exact stack — no placeholders, no 'TODO: replace this', no generic commands that might not apply.
${sharedContext}`;

  const userPrompt = `Generate complete setup files for:

Project: ${spec.projectName}
Platform: ${spec.platform}
Stack: ${JSON.stringify(spec.stack)}
Features: ${spec.features.join(', ')}

Generate ALL of the following:

---
FILE: setup/install.sh
---
A bash script that:
1. Checks prerequisites (Node version, required CLIs) and exits with a helpful message if any are missing
2. Runs npm install (or the correct package manager for this stack)
3. Copies .env.example to .env.local if .env.local does not already exist
4. Runs any required setup commands for each service in the stack (e.g. 'npx prisma migrate dev' for Prisma, 'supabase db push' for Supabase, etc.)
5. Prints a 'Setup complete' message with the exact command to start the dev server

---
FILE: setup/install.ps1
---
PowerShell equivalent of install.sh, same steps, correct PowerShell syntax.

---
FILE: setup/.env.example
---
Every environment variable this project requires, with:
- The exact variable name
- A comment explaining what it is and where to get it
- A realistic non-secret example value
- Variables grouped by service (Clerk, Supabase, Stripe, etc.)

Only include variables for services actually in ${JSON.stringify(spec.stack)}. Do not include variables for services not in the stack.

---
FILE: setup/env-validation.ts
---
A TypeScript module using Zod that:
- Validates all required environment variables on startup
- Throws a clear error naming the missing variable and linking to where to get it if any are missing
- Exports the validated env object for use throughout the project

Example structure:
import { z } from 'zod'

const envSchema = z.object({
  // (one entry per required env var, with z.string() and a descriptive error message)
})

export const env = envSchema.parse(process.env)

---
FILE: setup/health-check.ts
---
A TypeScript script that:
- Attempts to connect to each external service in the stack (database, auth provider, payment provider, etc.)
- Prints a green checkmark or red X for each service
- Exits with code 1 if any service is unreachable

---
FILE: setup/setup-guide.md
---
A human-readable guide:
1. Prerequisites (exact versions required)
2. Getting API keys (one section per service with exact steps and links to the correct dashboard page)
3. Running the install script
4. Verifying setup with the health check
5. Starting the development server
6. Common setup problems and solutions (3-5 real ones for this specific stack)`;

  if (isClaudeConfigured()) {
    try {
      const response = await claudeText(systemPrompt, userPrompt, 1, MODELS.CONTENT);
      const files: PackageFiles = {};
      const parts = response.split(/---\nFILE:\s*(.+?)\n---/g);
      for (let i = 1; i < parts.length; i += 2) {
        const path = parts[i].trim();
        const content = parts[i + 1].trim();
        if (path) files[path] = content + "\n";
      }
      if (Object.keys(files).length > 0) {
        return addMissingInstallCommands(spec, files);
      }
    } catch (e) {
      // Fallback below
    }
  }

  return fallbackSetup(spec);
}

export async function getInstallCommands(
  toolName: string,
  platform: string,
  isOffline: boolean,
): Promise<string> {
  const prompt = `Return ONLY the shell commands to install "${toolName}" in a ${platform} project.
No explanation, no markdown, just the commands.
${isOffline ? "The project runs offline — only include packages that work without internet after installation." : ""}

Example format:
npm install tree-sitter
npm install tree-sitter-javascript
npm install tree-sitter-python`;

  if (isClaudeConfigured()) {
    try {
      const response = await claudeText(
        "You are a DevOps engineer. Return ONLY the shell commands to install a package with no explanation, no markdown, just commands. One command per line.",
        prompt,
        1,
        MODELS.FAST,
      );
      const commands = response
        .replace(/```(?:bash|sh|shell)?/gi, "")
        .replace(/```/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(npm|pnpm|yarn|npx|pip|pip3|uv|cargo|go|brew|apt(?:-get)?)\s/.test(line));
      const packageLikeName = /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(toolName);
      if (packageLikeName && !commands.some((line) => line.toLowerCase().includes(toolName.toLowerCase()))) {
        commands.unshift(`npm install ${toolName}`);
      }
      if (commands.length > 0) return commands.join("\n");
    } catch {
      // Honest fallback below.
    }
  }

  const packageName = toolName.trim().toLowerCase().split(/\s+\+\s+|\s+/)[0];
  return `# Could not auto-generate install command for ${toolName}\n# Please run: npm install ${packageName}`;
}

async function addMissingInstallCommands(spec: ProjectSpec, files: PackageFiles): Promise<PackageFiles> {
  const unknown = lockedEntries(spec)
    .map(([, entry]) => entry.value)
    .filter((toolName) => !registryByName(toolName));
  if (unknown.length === 0) return files;

  const isOffline = Boolean(spec.constraints.technical?.mustBeOffline)
    || /\b(offline|no internet|without internet)\b/i.test(spec.description);
  const generated = await Promise.all(
    unknown.map((toolName) => getInstallCommands(toolName, spec.platform, isOffline)),
  );
  const commandBlock = Array.from(new Set(generated)).join("\n");
  const shell = files["setup/install.sh"] ?? `#!/usr/bin/env bash\nset -euo pipefail\n`;
  const powershell = files["setup/install.ps1"] ?? "";
  const shellWithCommands = shell.includes('echo "Done."')
    ? shell.replace('echo "Done."', `${commandBlock}\necho "Done."`)
    : `${shell.trimEnd()}\n${commandBlock}\n`;
  const powershellWithCommands = powershell.includes('Write-Host "Done."')
    ? powershell.replace('Write-Host "Done."', `${commandBlock}\nWrite-Host "Done."`)
    : `${powershell.trimEnd()}\n${commandBlock}\n`;
  return {
    ...files,
    "setup/install.sh": shellWithCommands,
    "setup/install.ps1": powershellWithCommands,
  };
}

async function fallbackSetup(spec: ProjectSpec): Promise<PackageFiles> {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const [, entry] of lockedEntries(spec)) {
    const reg = registryByName(entry.value);
    if (reg) known.push(...reg.installCommands);
    else unknown.push(entry.value);
  }
  const commands = Array.from(new Set(known));
  const isOffline = Boolean(spec.constraints.technical?.mustBeOffline)
    || /\b(offline|no internet|without internet)\b/i.test(spec.description);
  const unknownLines = await Promise.all(
    unknown.map((toolName) => getInstallCommands(toolName, spec.platform, isOffline)),
  );

  return {
    "setup/install.sh": `#!/usr/bin/env bash
set -euo pipefail
echo "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "echo 'No install commands - stack has no locked entries.'"}
echo "Done."
`,
    "setup/install.ps1": `Write-Host "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "Write-Host 'No install commands - stack has no locked entries.'"}
Write-Host "Done."
`,
    "setup/setup-guide.md": `# Setup Guide: ${spec.projectName}

1. Run \`setup/install.sh\` (macOS/Linux) or \`setup/install.ps1\` (Windows).
2. Configure environment variables - see \`tech-stack.md\` for required env vars per technology.
3. Copy \`agents.md\` to your repository root so every AI assistant reads it.
4. Start with the first phase in \`roadmap.md\`, loading context from \`context-manifests/\`.
${unknown.length ? `\n> Note: no verified install commands for: ${unknown.join(", ")}. Verify against official docs.` : ""}
`,
  };
}
