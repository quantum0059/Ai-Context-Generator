import { auth } from "@clerk/nextjs/server";
import { assemblePackage } from "../../../../contextforge/assembler";
import { projectSpecSchema } from "../../../../contextforge/spec";
import { checkSubscriptionLimits } from "../../../../lib/subscription";

/**
 * Generators run only against a finalized, validated ProjectSpec.
 * Returns the file map as JSON; the client assembles the ZIP with JSZip.
 * 
 * Plan enforcement: Free tier limited to 5 generations/month, Pro tier 100/month.
 */
export async function POST(req: Request) {
  // Check subscription limits if user is authenticated
  const { userId } = await auth();
  if (userId) {
    const { allowed, reason } = await checkSubscriptionLimits(userId);
    if (!allowed) {
      return Response.json(
        { error: reason, requiresUpgrade: true },
        { status: 403 },
      );
    }
  }

  const parsed = projectSpecSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid ProjectSpec", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { files, meta } = await assemblePackage(parsed.data);
    return Response.json({ files, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Package generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
