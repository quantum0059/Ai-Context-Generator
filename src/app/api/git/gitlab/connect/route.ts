import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "../../../../../lib/supabase";
import { generateOAuthState } from "../../../../../lib/git/oauth-state-helper";

/**
 * GET /api/git/gitlab/connect
 * Redirects an authenticated user to GitLab's OAuth authorization page.
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
    return Response.json({ error: "Sign in to connect GitLab." }, { status: 401 });
  }

  const clientId = process.env.GITLAB_CLIENT_ID;
  const redirectUri = process.env.GITLAB_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return Response.json(
      { error: "GITLAB_CLIENT_ID and GITLAB_REDIRECT_URI must be configured." },
      { status: 503 },
    );
  }

  const state = generateOAuthState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "api",
    state,
  });

  return Response.redirect(`https://gitlab.com/oauth/authorize?${params.toString()}`);
}
