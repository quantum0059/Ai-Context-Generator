/**
 * Server-side file upload validation.
 * Validates file size, type, and basic content checks.
 */

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/**
 * Validates an uploaded file before processing.
 */
export function validateUpload(file: File): UploadValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
    };
  }

  // Check file size is not zero
  if (file.size === 0) {
    return {
      valid: false,
      error: "File is empty.",
    };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}.`,
    };
  }

  // Check file extension
  const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }

  return { valid: true };
}

/**
 * Reads file magic numbers to verify it's actually an image.
 * Basic malware prevention (doesn't replace proper AV scanning).
 */
export async function verifyFileContent(file: File): Promise<UploadValidationResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check minimum file size for valid images
  if (bytes.length < 100) {
    return {
      valid: false,
      error: "File appears to be corrupted or too small to be a valid image.",
    };
  }

  // Check magic numbers for common image formats
  const magicNumbers: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/gif": [0x47, 0x49, 0x46, 0x38],
    "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header
  };

  const expected = magicNumbers[file.type];
  if (expected) {
    for (let i = 0; i < expected.length; i++) {
      if (bytes[i] !== expected[i]) {
        return {
          valid: false,
          error: "File content does not match declared file type.",
        };
      }
    }
  }

  return { valid: true };
}
