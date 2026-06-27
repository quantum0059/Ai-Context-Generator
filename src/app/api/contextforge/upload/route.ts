import { isCloudinaryConfigured, uploadDesignReference } from "../../../../lib/cloudinary";
import { checkRateLimit, getRateLimitIdentifier } from "../../../../lib/rateLimit";
import { validateUpload, verifyFileContent } from "../../../../lib/uploadValidation";

const MAX_REFERENCE_IMAGES = 10;

/** Upload up to ten validated design-reference images to Cloudinary. */
export async function POST(req: Request) {
  if (!isCloudinaryConfigured()) {
    return Response.json({ error: "Cloudinary is not configured." }, { status: 503 });
  }

  const identifier = getRateLimitIdentifier(req);
  const rateLimit = checkRateLimit(identifier, "/api/contextforge/upload");
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait before uploading again.", retryAfter: rateLimit.resetAt },
      { status: 429 },
    );
  }

  try {
    const formData = await req.formData();
    const files = [
      ...formData.getAll("files"),
      ...(formData.has("files") ? [] : formData.getAll("file")),
    ].filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return Response.json({ error: "No images were provided." }, { status: 400 });
    }
    if (files.length > MAX_REFERENCE_IMAGES) {
      return Response.json(
        { error: `A maximum of ${MAX_REFERENCE_IMAGES} design-reference images is allowed.` },
        { status: 400 },
      );
    }

    for (const file of files) {
      const metadata = validateUpload(file);
      if (!metadata.valid) {
        return Response.json({ error: `${file.name}: ${metadata.error}` }, { status: 400 });
      }
      const content = await verifyFileContent(file);
      if (!content.valid) {
        return Response.json({ error: `${file.name}: ${content.error}` }, { status: 400 });
      }
    }

    const settled = await Promise.allSettled(files.map(uploadDesignReference));
    const images = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const errors = settled.flatMap((result, index) => result.status === "rejected"
      ? [`${files[index].name}: ${result.reason instanceof Error ? result.reason.message : "Upload failed"}`]
      : []);

    if (images.length === 0) {
      return Response.json({ error: errors[0] ?? "Image upload failed." }, { status: 502 });
    }
    return Response.json({ images, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
