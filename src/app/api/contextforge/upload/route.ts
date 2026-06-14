import { getSupabase, isClerkConfigured } from "../../../../lib/supabase";
import { checkRateLimit, getRateLimitIdentifier } from "../../../../lib/rateLimit";
import { validateUpload, verifyFileContent } from "../../../../lib/uploadValidation";

/**
 * Upload design reference images to Supabase storage.
 * 
 * Validates:
 * - File size (max 5MB)
 * - File type (images only)
 * - File content (magic number verification)
 * - Rate limiting (10 uploads per minute)
 */
export async function POST(req: Request) {
  if (!isClerkConfigured()) {
    return Response.json({ error: "Clerk is not configured." }, { status: 503 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  // Rate limiting
  const identifier = getRateLimitIdentifier(req);
  const rateLimit = checkRateLimit(identifier, "/api/contextforge/upload");

  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Rate limit exceeded. Please wait before making another request.",
        retryAfter: rateLimit.resetAt,
      },
      { status: 429 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }

    // Validate file metadata
    const validation = validateUpload(file);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Verify file content
    const contentValidation = await verifyFileContent(file);
    if (!contentValidation.valid) {
      return Response.json({ error: contentValidation.error }, { status: 400 });
    }

    // Upload to Supabase
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { data, error } = await supabase.storage
      .from("design-references")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("design-references")
      .getPublicUrl(data.path);

    return Response.json({ url: urlData.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
