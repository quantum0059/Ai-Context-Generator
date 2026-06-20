import { NextRequest } from "next/server";
import { validateOAuthState } from "../../../../../lib/git/oauth-state-helper";
import { GitLabProvider } from "../../../../../lib/git/gitlab-provider";
import { encryptToken } from "../../../../../lib/git/token-encryption";
import { getSupabase } from "../../../../../lib/supabase";

/**
 * GET /api/git/gitlab/callback
 * GitLab redirects here after user authorizes. Validates CSRF state,
 * exchanges the code for tokens, encrypts and upserts into git_connections,
 * then redirects back to the wizard root.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${origin}/?git_connect=error&provider=gitlab&reason=missing_params`);
  }

  // Validate CSRF state and extract userId
  let userId: string;
  try {
    const result = validateOAuthState(state);
    userId = result.userId;
  } catch {
    return Response.redirect(`${origin}/?git_connect=error&provider=gitlab&reason=invalid_state`);
  }

  // Exchange code for access token
  const provider = new GitLabProvider();
  let authResult;
  try {
    authResult = await provider.authenticate(code);
  } catch {
    return Response.redirect(`${origin}/?git_connect=error&provider=gitlab&reason=auth_failed`);
  }

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptToken(authResult.accessToken);
  const encryptedRefreshToken = authResult.refreshToken
    ? encryptToken(authResult.refreshToken)
    : null;

  // Upsert into git_connections (mirror billing/webhook upsert style)
  const supabase = getSupabase();
  if (!supabase) {
    return Response.redirect(`${origin}/?git_connect=error&provider=gitlab&reason=db_unavailable`);
  }

  const { error } = await supabase.from("git_connections").upsert(
    {
      user_id: userId,
      provider: "gitlab",
      provider_user_id: authResult.providerUserId,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: authResult.expiresAt?.toISOString() ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    console.error("GitLab git_connections upsert error:", error.message);
    return Response.redirect(`${origin}/?git_connect=error&provider=gitlab&reason=db_error`);
  }

  return Response.redirect(`${origin}/?git_connect=success&provider=gitlab`);
}
