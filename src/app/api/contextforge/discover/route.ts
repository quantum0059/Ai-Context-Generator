import { discoverCategories } from "../../../../contextforge/discovery";
import { draftInputSchema } from "../../../../contextforge/spec";

export async function POST(req: Request) {
  const parsed = draftInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await discoverCategories(parsed.data);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Category discovery failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
