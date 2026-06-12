import JSZip from "jszip";
import { buildPackage } from "../../../generators/packageBuilder";
import { recommend } from "../../../generators/recommender";
import { generateRequestSchema } from "../../../lib/schemas";
import type { Analysis, Selections } from "../../../types";

export async function POST(req: Request) {
  const parsed = generateRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { input, selections } = parsed.data;
    const analysis = parsed.data.analysis as Analysis;
    // Recompute recommendations server-side so output is always registry-consistent.
    const recommendations = recommend(input, analysis);
    const files = buildPackage(
      input,
      analysis,
      recommendations,
      selections as Selections,
    );

    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(`project-package/${path}`, content);
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const safeName = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-ai-context-package.zip"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
