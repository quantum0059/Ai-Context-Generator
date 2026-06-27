const UPLOAD_TIMEOUT_MS = 20_000;

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
      && process.env.CLOUDINARY_API_KEY
      && process.env.CLOUDINARY_API_SECRET,
  );
}

export async function uploadDesignReference(file: File): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("folder", "contextforge/design-references");
  body.append("use_filename", "true");
  body.append("unique_filename", "true");
  body.append("overwrite", "false");

  const authorization = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${authorization}` },
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    },
  );
  const data = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.secure_url || !data.public_id) {
    throw new Error(data.error?.message ?? `Cloudinary upload failed (${response.status}).`);
  }
  return { url: data.secure_url, publicId: data.public_id };
}
