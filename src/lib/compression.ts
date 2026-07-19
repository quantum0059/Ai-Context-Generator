import { gzipSync, brotliCompressSync, constants as zlibConstants } from "zlib";

/**
 * Minimum body size (bytes) before compression is applied.
 * Compressing tiny payloads (error messages, short acks) adds CPU overhead with
 * no real benefit. 1 KB is a widely-used threshold.
 */
const COMPRESSION_THRESHOLD_BYTES = 1024;

/**
 * Parses the Accept-Encoding request header and returns the preferred encoding
 * the server can satisfy, in priority order: br → gzip → identity.
 */
function negotiateEncoding(acceptEncoding: string | null): "br" | "gzip" | "identity" {
  if (!acceptEncoding) return "identity";
  const header = acceptEncoding.toLowerCase();
  if (header.includes("br")) return "br";
  if (header.includes("gzip")) return "gzip";
  return "identity";
}

/**
 * Compresses a JSON-serialisable value and returns a `Response` with the
 * correct `Content-Encoding` / `Vary` headers.
 *
 * Behaviour:
 * - Negotiates brotli → gzip → identity based on the request's Accept-Encoding.
 * - Skips compression when the serialised payload is under 1 KB.
 * - Never re-compresses if a Content-Encoding header is already set (prevents
 *   double-compression behind a proxy that also compresses).
 *
 * Usage in route handlers:
 *   return withCompression(myData, req);          // replace Response.json(myData)
 *
 * @param data    The JSON-serialisable response body.
 * @param request The incoming Next.js Request (used to read Accept-Encoding).
 * @param status  HTTP status code (default 200).
 */
export function withCompression(
  data: unknown,
  request: Request,
  status = 200,
): Response {
  const json = JSON.stringify(data);
  const raw = Buffer.from(json, "utf8");

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // Always include Vary so caches and CDNs serve the right encoded variant.
    Vary: "Accept-Encoding",
  };

  // Below threshold: return plain JSON — no compression overhead.
  if (raw.byteLength < COMPRESSION_THRESHOLD_BYTES) {
    return new Response(raw, { status, headers: baseHeaders });
  }

  const encoding = negotiateEncoding(request.headers.get("accept-encoding"));

  if (encoding === "br") {
    const compressed = brotliCompressSync(raw, {
      params: {
        // Quality 4 — good ratio with low latency, suitable for hot API paths.
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
    return new Response(compressed, {
      status,
      headers: { ...baseHeaders, "Content-Encoding": "br" },
    });
  }

  if (encoding === "gzip") {
    const compressed = gzipSync(raw, {
      // Level 6 — Node default; excellent ratio/speed trade-off.
      level: 6,
    });
    return new Response(compressed, {
      status,
      headers: { ...baseHeaders, "Content-Encoding": "gzip" },
    });
  }

  // identity — client does not accept compressed content.
  return new Response(raw, { status, headers: baseHeaders });
}
