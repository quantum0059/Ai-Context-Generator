import { auth } from "@clerk/nextjs/server";
import { assemblePackage } from "../../../../contextforge/assembler";
import { projectSpecSchema } from "../../../../contextforge/spec";
import { checkSubscriptionLimits } from "../../../../lib/subscription";
import { checkRateLimit, getRateLimitIdentifier } from "../../../../lib/rateLimit";
import { withCompression } from "../../../../lib/compression";

/**
 * Generators run only against a finalized, validated ProjectSpec.
 * Returns the file map as JSON; the client assembles the ZIP with JSZip.
 *
 * Abuse protection (required for public launch):
 * - Every caller is rate limited by IP/identifier, so the expensive AI
 *   pipeline cannot be hammered anonymously.
 * - Authenticated users are additionally subject to plan-based quotas.
 *   Anonymous users are ALSO capped (they no longer bypass all limits).
 *
 * Plan enforcement: Free tier limited to 5 generations/month, Pro tier 100/month.
 */
export async function POST(req: Request) {
  // Rate limit every request up-front (applies to anonymous users too).
  const identifier = getRateLimitIdentifier(req);
  const rateLimit = checkRateLimit(identifier, "/api/contextforge/generate");
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait before generating again.", retryAfter: rateLimit.resetAt },
      { status: 429 },
    );
  }

  // Subscription-based quota. Anonymous users are held to the free-tier limit
  // rather than being allowed to bypass metering entirely.
  const { userId } = await auth();
  const { allowed, reason } = await checkSubscriptionLimits(userId ?? identifier);
  if (!allowed) {
    return Response.json(
      { error: reason, requiresUpgrade: true },
      { status: 403 },
    );
  }

  const parsed = projectSpecSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid ProjectSpec", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { files, meta } = await assemblePackage(parsed.data);
    return withCompression({ files, meta }, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Package generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
