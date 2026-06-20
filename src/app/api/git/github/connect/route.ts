import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "../../../../../lib/supabase";
import { generateOAuthState } from "../../../../../lib/git/oauth-state-helper";

/**
 * GET /api/git/github/connect
 * Redirects an authenticated user to GitHub's OAuth authorization page.
 */
export async function GET() {
  if (!isClerkConfigured()) {
    return Response.json(
      { error: "Git integration requires Clerk to be configured." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to connect GitHub." }, { status: 401 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return Response.json(
      { error: "GITHUB_CLIENT_ID and GITHUB_REDIRECT_URI must be configured." },
      { status: 503 },
    );
  }

  const state = generateOAuthState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo",
    state,
  });

  return Response.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}
