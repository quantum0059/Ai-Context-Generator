import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { projectSpecSchema } from "../../../../contextforge/spec";
import { getSupabase, isClerkConfigured } from "../../../../lib/supabase";

const requestSchema = z.object({
  spec: projectSpecSchema,
  meta: z.object({
    packageVersion: z.string(),
    projectSpecVersion: z.string(),
    generatedAt: z.string(),
  }),
});

/** Saves the finalized ProjectSpec + version metadata for logged-in users. */
export async function POST(req: Request) {
  if (!isClerkConfigured()) {
    return Response.json(
      { error: "Saving requires Clerk to be configured (see README)." },
      { status: 503 },
    );
  }
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json(
      { error: "Saving requires Supabase to be configured (see README)." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to save packages." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { spec, meta } = parsed.data;
  const { error } = await supabase.from("context_packages").insert({
    user_id: userId,
    spec_id: spec.id,
    project_name: spec.projectName,
    spec,
    package_version: meta.packageVersion,
    project_spec_version: meta.projectSpecVersion,
    generated_at: meta.generatedAt,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ saved: true });
}
