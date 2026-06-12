import { getSupabase } from "../../../../lib/supabase";

/** Uploads a design reference image to Supabase Storage; returns its public URL. */
export async function POST(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json(
      { error: "Image upload requires Supabase to be configured (see README)." },
      { status: 503 },
    );
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Provide a 'file' form field." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image uploads are allowed." }, { status: 400 });
  }
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]+/g, "-")}`;
  const { error } = await supabase.storage
    .from("design-references")
    .upload(path, file, { contentType: file.type });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const { data } = supabase.storage.from("design-references").getPublicUrl(path);
  return Response.json({ url: data.publicUrl });
}
