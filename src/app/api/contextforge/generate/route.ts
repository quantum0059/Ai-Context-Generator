import { assemblePackage } from "../../../../contextforge/assembler";
import { projectSpecSchema } from "../../../../contextforge/spec";

/**
 * Generators run only against a finalized, validated ProjectSpec.
 * Returns the file map as JSON; the client assembles the ZIP with JSZip.
 */
export async function POST(req: Request) {
  const parsed = projectSpecSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { files, meta } = await assemblePackage(parsed.data);
    return Response.json({ files, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Package generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
