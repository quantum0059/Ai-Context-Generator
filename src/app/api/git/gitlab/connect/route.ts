import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "../../../../../lib/supabase";
import { generateOAuthState } from "../../../../../lib/git/oauth-state-helper";

/**
 * GET /api/git/gitlab/connect
 * Redirects an authenticated user to GitLab's OAuth authorization page.
 * On any pre-redirect failure, redirects to / with error query params so
 * git-export-section.tsx can display the error inline.
 */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  if (!isClerkConfigured()) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=gitlab&reason=config_missing`,
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=gitlab&reason=not_signed_in`,
    );
  }

  const clientId = process.env.GITLAB_CLIENT_ID;
  const redirectUri = process.env.GITLAB_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=gitlab&reason=config_missing`,
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
