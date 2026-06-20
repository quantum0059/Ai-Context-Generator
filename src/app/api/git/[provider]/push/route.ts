import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured, getSupabase } from "../../../../../lib/supabase";
import { decryptToken } from "../../../../../lib/git/token-encryption";
import { isValidProvider, getGitProvider } from "../../../../../lib/git/provider-lookup";
import { assemblePackage } from "../../../../../contextforge/assembler";
import type { ProjectSpec } from "../../../../../types/projectspec";

/**
 * POST /api/git/[provider]/push
 *
 * Pushes a ContextForge package to a git repository as a PR/MR.
 *
 * Body: { repositoryId, repositoryName, defaultBranch, specId }
 *
 * Flow:
 *   1. Auth + validate provider
 *   2. Decrypt stored token
 *   3. Re-fetch spec from context_packages by specId (never trust client files)
 *   4. assemblePackage(spec) server-side
 *   5. Prefix all paths with .contextforge/
 *   6. createBranch → commitFiles → createPullRequest
 *   7. Record in repository_pushes
 */
export async function POST(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const { provider } = params;
  if (!isValidProvider(provider)) {
    return Response.json({ error: "Invalid provider." }, { status: 400 });
  }

  if (!isClerkConfigured()) {
    return Response.json(
      { error: "Git integration requires Clerk to be configured." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to push packages." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  // Parse request body
  const body = (await req.json()) as {
    repositoryId?: string;
    repositoryName?: string;
    defaultBranch?: string;
    specId?: string;
  };

  if (!body.repositoryId || !body.repositoryName || !body.defaultBranch || !body.specId) {
    return Response.json(
      { error: "repositoryId, repositoryName, defaultBranch, and specId are all required." },
      { status: 400 },
    );
  }

  const { repositoryId, repositoryName, defaultBranch, specId } = body;

  // ---- Fetch encrypted token ----
  const { data: connection, error: connErr } = await supabase
    .from("git_connections")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (connErr) {
    return Response.json({ error: connErr.message }, { status: 500 });
  }
  if (!connection) {
    return Response.json(
      { error: `No ${provider} connection found. Connect first.` },
      { status: 404 },
    );
  }

  const accessToken = decryptToken(connection.access_token);

  // ---- Fetch spec from context_packages (never trust client-supplied files) ----
  const { data: pkg, error: pkgErr } = await supabase
    .from("context_packages")
    .select("spec")
    .eq("spec_id", specId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pkgErr) {
    return Response.json({ error: pkgErr.message }, { status: 500 });
  }
  if (!pkg) {
    return Response.json(
      { error: `No saved package found for specId "${specId}". Save the package first.` },
      { status: 404 },
    );
  }

  const spec = pkg.spec as ProjectSpec;
  const branchName = `contextforge/update-${Date.now()}`;

  // ---- Assemble + push ----
  try {
    // Re-assemble the package server-side
    const { files } = await assemblePackage(spec);

    // Prefix all paths with .contextforge/ — only writes into this directory
    const prefixedFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      prefixedFiles[`.contextforge/${path}`] = content;
    }

    const gitProvider = getGitProvider(provider);

    // Create feature branch
    await gitProvider.createBranch(accessToken, repositoryName, branchName, defaultBranch);

    // Commit all files in a single batch operation
    await gitProvider.commitFiles(
      accessToken,
      repositoryName,
      branchName,
      prefixedFiles,
      "chore: update .contextforge context package",
    );

    // Open PR / MR
    const { url: prUrl } = await gitProvider.createPullRequest(
      accessToken,
      repositoryName,
      branchName,
      defaultBranch,
      "Update .contextforge context package",
    );

    // Record success
    await supabase.from("repository_pushes").insert({
      user_id: userId,
      provider,
      spec_id: specId,
      repository_id: repositoryId,
      repository_name: repositoryName,
      branch_name: branchName,
      pr_url: prUrl,
      status: "success",
    });

    return Response.json({ prUrl });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Push failed.";

    // Record failure — wrapped in try/catch so a DB error doesn't mask the original
    try {
      await supabase.from("repository_pushes").insert({
        user_id: userId,
        provider,
        spec_id: specId,
        repository_id: repositoryId,
        repository_name: repositoryName,
        branch_name: branchName,
        status: "failed",
        error_message: errorMessage,
      });
    } catch {
      // Intentionally swallowed — don't mask the original push error
    }

    return Response.json({ error: errorMessage }, { status: 502 });
  }
}
