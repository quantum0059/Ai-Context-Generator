import { analyzeProject } from "../../../generators/analyzer";
import { recommend } from "../../../generators/recommender";
import { projectInputSchema } from "../../../lib/schemas";

export async function POST(req: Request) {
  const parsed = projectInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const analysis = await analyzeProject(parsed.data);
    const recommendations = recommend(parsed.data, analysis);
    return Response.json({ analysis, recommendations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
