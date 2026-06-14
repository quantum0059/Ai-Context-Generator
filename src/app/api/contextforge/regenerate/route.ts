import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { regeneratePackage } from "../../../../contextforge/regenerate";
import { projectSpecSchema } from "../../../../contextforge/spec";
import { checkSubscriptionLimits } from "../../../../lib/subscription";

const requestSchema = z.object({
  oldSpec: projectSpecSchema,
  editedSpec: projectSpecSchema,
  oldFiles: z.record(z.string(), z.string()),
});

/**
 * Selective regeneration - only affected generators re-run.
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

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid regeneration request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await regeneratePackage(
      parsed.data.oldSpec,
      parsed.data.editedSpec,
      parsed.data.oldFiles,
    );
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
