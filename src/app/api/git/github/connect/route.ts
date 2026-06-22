import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "../../../../../lib/supabase";
import { generateOAuthState } from "../../../../../lib/git/oauth-state-helper";

/**
 * GET /api/git/github/connect
 * Redirects an authenticated user to GitHub's OAuth authorization page.
 * On any pre-redirect failure, redirects to / with error query params so
 * git-export-section.tsx can display the error inline.
 */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  if (!isClerkConfigured()) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=github&reason=config_missing`,
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=github&reason=not_signed_in`,
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return Response.redirect(
      `${origin}/?git_connect=error&provider=github&reason=config_missing`,
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
