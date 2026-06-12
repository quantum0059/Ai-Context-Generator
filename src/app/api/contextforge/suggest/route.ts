import { z } from "zod";
import { draftInputSchema } from "../../../../contextforge/spec";
import { suggestForCategory } from "../../../../contextforge/suggestions";

const requestSchema = z.object({
  category: z.string().min(1),
  draft: draftInputSchema,
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await suggestForCategory(parsed.data.category, parsed.data.draft);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggestion resolution failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
