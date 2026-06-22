import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { isClerkConfigured, getSupabase } from "../../../../../lib/supabase";
import { decryptToken } from "../../../../../lib/git/token-encryption";
import { isValidProvider, getGitProvider } from "../../../../../lib/git/provider-lookup";

/**
 * GET /api/git/[provider]/repositories?page=1&search=foo
 * Lists repositories for the authenticated user's connected git provider.
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
    return Response.json({ error: "Sign in to list repositories." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  // Fetch the encrypted token for this user + provider
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

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const search = url.searchParams.get("search") ?? undefined;

  try {
    const gitProvider = getGitProvider(provider);
    const repositories = await gitProvider.listRepositories(accessToken, { page, search });
    return Response.json({ repositories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list repositories.";
    // Detect 401 from provider → surface as reconnect-required
    if (message.includes("(401)")) {
      return Response.json(
        { error: "Your connection has expired. Please reconnect.", code: "RECONNECT_REQUIRED" },
        { status: 401 },
      );
    }
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/git/[provider]/repositories
 * Creates a new repository on the connected git provider.
 * Body: { name, description?, visibility, initializeReadme }
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
    return Response.json({ error: "Sign in to create repositories." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  // Fetch the encrypted token
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

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    visibility?: string;
    initializeReadme?: boolean;
  };

  if (!body.name) {
    return Response.json({ error: "Repository name is required." }, { status: 400 });
  }
  if (body.visibility !== "public" && body.visibility !== "private") {
    return Response.json(
      { error: 'Visibility must be "public" or "private".' },
      { status: 400 },
    );
  }

  try {
    const gitProvider = getGitProvider(provider);
    const repository = await gitProvider.createRepository(accessToken, {
      name: body.name,
      description: body.description,
      visibility: body.visibility,
      initializeReadme: body.initializeReadme ?? false,
    });
    return Response.json({ repository }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create repository.";
    // Detect 401 from provider → surface as reconnect-required
    if (message.includes("(401)")) {
      return Response.json(
        { error: "Your connection has expired. Please reconnect.", code: "RECONNECT_REQUIRED" },
        { status: 401 },
      );
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
