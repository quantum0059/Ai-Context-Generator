import { discoverCategories } from "../../../../contextforge/discovery";
import { draftInputSchema } from "../../../../contextforge/spec";
import { checkRateLimit, getRateLimitIdentifier } from "../../../../lib/rateLimit";

/**
 * Dynamic Category Discovery (Section 3): one Claude call determines which
 * technology categories are needed - categories are NOT hardcoded.
 * 
 * Rate limited: 10 requests per minute per IP/user.
 */
export async function POST(req: Request) {
  const identifier = getRateLimitIdentifier(req);
  const rateLimit = checkRateLimit(identifier, "/api/contextforge/discover");

  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Rate limit exceeded. Please wait before making another request.",
        retryAfter: rateLimit.resetAt,
      },
      { status: 429 },
    );
  }

  const parsed = draftInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await discoverCategories(parsed.data);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Category discovery failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
