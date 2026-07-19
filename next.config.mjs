/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable built-in gzip compression for `next start`.
  // Applies to all responses >= ~1 KB, respects Accept-Encoding, and is
  // skipped in `next dev` (intentional — dev mode disables it for speed).
  compress: true,
};

export default nextConfig;
