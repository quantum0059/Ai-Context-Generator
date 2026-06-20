import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured, getSupabase } from "../../../../../lib/supabase";

/**
 * GET /api/git/github/status
 * Returns { connected: boolean } for the authenticated user's GitHub connection.
 * Never selects token columns.
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
    return Response.json({ error: "Sign in to check status." }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  const { data } = await supabase
    .from("git_connections")
    .select("user_id")
    .eq("user_id", userId)
    .eq("provider", "github")
    .maybeSingle();

  return Response.json({ connected: !!data });
}
