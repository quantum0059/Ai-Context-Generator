import { z } from "zod";
import { regeneratePackage } from "../../../../contextforge/regenerate";
import { projectSpecSchema } from "../../../../contextforge/spec";

const requestSchema = z.object({
  oldSpec: projectSpecSchema,
  editedSpec: projectSpecSchema,
  oldFiles: z.record(z.string(), z.string()),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
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
