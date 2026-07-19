import { auth } from "@clerk/nextjs/server";
import { getSupabase, isClerkConfigured } from "../../../../lib/supabase";
import { withCompression } from "../../../../lib/compression";

/** Lists the saved packages (spec + versions) for the signed-in user. */
export async function GET(req: Request) {
  if (!isClerkConfigured()) {
    return Response.json({ error: "Clerk is not configured." }, { status: 503 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to view saved packages." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("context_packages")
    .select("id, spec_id, project_name, spec, package_version, project_spec_version, generated_at")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return withCompression({ packages: data ?? [] }, req);
}
