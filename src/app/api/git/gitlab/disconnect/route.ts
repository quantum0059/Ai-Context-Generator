import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured, getSupabase } from "../../../../../lib/supabase";

/**
 * POST /api/git/gitlab/disconnect
 * Deletes the authenticated user's GitLab git_connections row.
 */
export async function POST() {
  if (!isClerkConfigured()) {
    return Response.json(
      { error: "Git integration requires Clerk to be configured." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to disconnect GitLab." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  const { error } = await supabase
    .from("git_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "gitlab");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ disconnected: true });
}
