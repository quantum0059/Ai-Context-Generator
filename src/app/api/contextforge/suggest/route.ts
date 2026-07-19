import { z } from "zod";
import { draftInputSchema } from "../../../../contextforge/spec";
import { suggestForCategory } from "../../../../contextforge/suggestions";
import { withCompression } from "../../../../lib/compression";

const requestSchema = z.object({
  category: z.string().min(1),
  draft: draftInputSchema,
});

export async function POST(req: Request) {
  const body = await req.json();
  console.log(`[Suggest API] Received request for category: ${body.category}`);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`[Suggest API] Validation failed:`, parsed.error.flatten());
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await suggestForCategory(parsed.data.category, parsed.data.draft);
    console.log(`[Suggest API] Successfully resolved ${result.candidates.length} candidates for ${parsed.data.category}`);
    return withCompression(result, req);
  } catch (err) {
    console.error(`[Suggest API] Uncaught error:`, err);
    const message = err instanceof Error ? err.message : "Suggestion resolution failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
