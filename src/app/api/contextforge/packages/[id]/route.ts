import { auth } from "@clerk/nextjs/server";
import { getSupabase, isClerkConfigured } from "../../../../../lib/supabase";

/** Fetches a single saved package with its full spec for loading into the wizard. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isClerkConfigured()) {
    return Response.json({ error: "Clerk is not configured." }, { status: 503 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to access saved packages." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("context_packages")
    .select("id, spec_id, project_name, spec, package_version, project_spec_version, generated_at")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Package not found." }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ package: data });
}

/** Deletes a saved package for the authenticated user. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isClerkConfigured()) {
    return Response.json({ error: "Clerk is not configured." }, { status: 503 });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to delete packages." }, { status: 401 });
  }

  const { error } = await supabase
    .from("context_packages")
    .delete()
    .eq("id", params.id)
    .eq("user_id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ deleted: true });
}
