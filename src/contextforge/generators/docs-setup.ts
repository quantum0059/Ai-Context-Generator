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

  const shell = files["setup/install.sh"] ?? `#!/usr/bin/env bash\nset -euo pipefail\n`;
  const powershell = files["setup/install.ps1"] ?? "";

  // Deduplicate generated commands against lines already present in the script
  const existingLines = new Set([...shell.split("\n"), ...powershell.split("\n")]);
  const newLines = Array.from(new Set(generated.flatMap((block) => block.split("\n"))))
    .filter((line) => line.trim().length > 0 && !existingLines.has(line));

  if (newLines.length === 0) return files;
  const commandBlock = newLines.join("\n");

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
  // Deduplicate install commands — prevents the "-D installed 2 times" validator warning
  const commands = Array.from(new Set(known));
  const isOffline = Boolean(spec.constraints.technical?.mustBeOffline)
    || /\b(offline|no internet|without internet)\b/i.test(spec.description);
  const unknownLines = await Promise.all(
    unknown.map((toolName) => getInstallCommands(toolName, spec.platform, isOffline)),
  );

  // Determine dev server start command from framework
  const locked = lockedEntries(spec);
  const hasExpo = locked.some(([, e]) => e.value.toLowerCase().includes('expo'));
  const hasNext = locked.some(([, e]) => e.value.toLowerCase().includes('next'));
  const startCmd = hasExpo ? 'npx expo start' : hasNext ? 'npm run dev' : 'npm run dev';

  // Build .env.example from registry env vars
  const envLines: string[] = [];
  const envByTool: Map<string, string[]> = new Map();
  for (const [, entry] of locked) {
    const reg = registryByName(entry.value);
    if (reg?.envVars && reg.envVars.length > 0) {
      envByTool.set(entry.value, reg.envVars);
    }
  }
  if (envByTool.size > 0) {
    Array.from(envByTool.entries()).forEach(([tool, vars]) => {
      envLines.push(`# ── ${tool} ──────────────────────────────────────────`);
      vars.forEach((v: string) => {
        // Produce a realistic example value based on the variable name
        let example = 'your_value_here';
        if (v.includes('URL')) example = 'https://your-project.supabase.co';
        if (v.includes('KEY') && v.includes('PUBLIC')) example = 'pk_live_replace_with_your_key';

        if (v.includes('KEY') && !v.includes('PUBLIC')) example = 'sk_live_replace_with_your_key';

        if (v.includes('SECRET')) example = 'whsec_xxxxxxxxxxxxxxxxxxxxxxxx';
        if (v.includes('PUBLISHABLE')) example = 'pk_live_xxxxxxxxxxxxxxxxxxxxxxxx';
        if (v.includes('ANON')) example = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
        if (v.includes('APP_URL') || v.includes('SITE_URL')) example = 'http://localhost:3000';
        envLines.push(`${v}=${example}`);
      });
      envLines.push('');
    });
  } else {
    envLines.push('# No environment variables detected from the locked stack.');
    envLines.push('# Add any required vars here, e.g.:');
    envLines.push('# DATABASE_URL=postgresql://localhost:5432/mydb');
  }

  return {
    "setup/install.sh": `#!/usr/bin/env bash
set -euo pipefail

# ── Prerequisites ─────────────────────────────────────────────────────────────
echo "Checking prerequisites for ${spec.projectName}..."
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is not installed. Install it from https://nodejs.org (LTS recommended)" && exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node -v)" && exit 1
fi
echo "✅ Node.js $(node -v)"

# ── Install dependencies ───────────────────────────────────────────────────────
echo "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "echo 'No install commands - stack has no locked entries.'"}

# ── Environment variables ─────────────────────────────────────────────────────
if [ ! -f .env.local ]; then
  cp setup/.env.example .env.local
  echo "✅ Created .env.local from setup/.env.example — fill in your API keys"
else
  echo "ℹ️  .env.local already exists — skipping copy"
fi

echo ""
echo "✅ Setup complete! Start the dev server with: ${startCmd}"
`,
    "setup/install.ps1": `# ── Prerequisites ─────────────────────────────────────────────────────────────
Write-Host "Checking prerequisites for ${spec.projectName}..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Install it from https://nodejs.org (LTS recommended)"
  exit 1
}
$nodeVer = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVer -lt 18) {
  Write-Error "Node.js 18+ required. Current: $(node -v)"
  exit 1
}
Write-Host "Node.js $(node -v) is installed." -ForegroundColor Green

# ── Install dependencies ───────────────────────────────────────────────────────
Write-Host "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "Write-Host 'No install commands - stack has no locked entries.'"}

# ── Environment variables ─────────────────────────────────────────────────────
if (-not (Test-Path .env.local)) {
  Copy-Item setup/.env.example .env.local
  Write-Host "Created .env.local from setup/.env.example - fill in your API keys" -ForegroundColor Green
} else {
  Write-Host ".env.local already exists - skipping copy" -ForegroundColor Yellow
}

Write-Host "Done. Start the dev server with: ${startCmd}" -ForegroundColor Green
`,
    "setup/.env.example": `# Environment Variables — ${spec.projectName}
# Copy this file to .env.local and fill in the values.
# NEVER commit .env.local to version control.

${envLines.join("\n")}`,
    "setup/setup-guide.md": `# Setup Guide: ${spec.projectName}

## Prerequisites

- **Node.js** 18 or higher — [nodejs.org](https://nodejs.org)
- **npm** 9+ (comes with Node.js)
${hasExpo ? '- **Expo CLI** — `npm install -g expo-cli`\n- **Expo Go** app on your phone (iOS or Android)' : ''}

## 1. Install Dependencies

\`\`\`bash
bash setup/install.sh   # macOS / Linux
\`\`\`
\`\`\`powershell
./setup/install.ps1     # Windows PowerShell
\`\`\`

## 2. Configure Environment Variables

\`setup/install.sh\` copies \`setup/.env.example\` to \`.env.local\` automatically.
Open \`.env.local\` and fill in the values:

${Array.from(envByTool.entries()).map(([tool, vars]: [string, string[]]) =>
  `### ${tool}\n${vars.map((v: string) => `- \`${v}\` — get from the ${tool} dashboard`).join('\n')}`
).join('\n\n') || '- See `setup/.env.example` for the full list of required variables.'}

## 3. Start the Development Server

\`\`\`bash
${startCmd}
\`\`\`

## Common Setup Problems

| Problem | Solution |
|---|---|
| \`Module not found\` | Run \`npm install\` again; delete \`node_modules\` and retry |
| \`NEXT_PUBLIC_* is undefined\` | Restart the dev server after editing \`.env.local\` |
| \`Invalid API key\` | Double-check the key in \`.env.local\` — no quotes needed |
| Port 3000 in use | Run with \`PORT=3001 ${startCmd}\` |
${unknown.length ? `\n> Note: no verified install commands for: ${unknown.join(", ")}. Verify against official docs.` : ""}
`,
  };
}

