import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { isClerkConfigured, getSupabase } from "../../../../../lib/supabase";
import { decryptToken } from "../../../../../lib/git/token-encryption";
import { isValidProvider, getGitProvider } from "../../../../../lib/git/provider-lookup";

/**
 * GET /api/git/[provider]/tree?repo=<owner/name|id>&ref=<branch>
 * Returns the recursive file tree of a connected repository so the context
 * map can render its real structure.
 */
export async function GET(
  req: NextRequest,
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
    return Response.json({ error: "Sign in to read repository files." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo");
  const ref = url.searchParams.get("ref") ?? undefined;
  if (!repo) {
    return Response.json({ error: "A 'repo' query parameter is required." }, { status: 400 });
  }

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

  try {
    const gitProvider = getGitProvider(provider);
    const tree = await gitProvider.listTree(accessToken, repo, ref);
    return Response.json({ tree });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read repository tree.";
    if (message.includes("(401)")) {
      return Response.json(
        { error: "Your connection has expired. Please reconnect.", code: "RECONNECT_REQUIRED" },
        { status: 401 },
      );
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
