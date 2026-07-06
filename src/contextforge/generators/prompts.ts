import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { slugify } from "./shared";
import { getFeatureAspects } from "./prompt-detector";
import { generateAspectPrompt } from "./prompt-builder";
export { isPromptContentValid } from "./prompt-validator";

/** Dynamic prompt generation per feature with rich, self-contained context (Section 8). */
export async function generatePrompts(spec: ProjectSpec, sharedContext: string = ''): Promise<PackageFiles> {
  const files: PackageFiles = {};

  for (let featureIndex = 0; featureIndex < spec.features.length; featureIndex++) {
    const feature = spec.features[featureIndex];
    // Features that appear before this one in the build order — agents need to know they exist
    const priorFeatures = spec.features.slice(0, featureIndex);
    console.log(
      `[Generator] Generating ${feature} prompts (${featureIndex + 1}/${spec.features.length})...`,
    );
    const featureSlug = slugify(feature);
    const aspects = await getFeatureAspects(spec, feature, sharedContext);

    const aspectPromises = aspects.map(async (aspect) => {
      const generatedContent = await generateAspectPrompt(spec, feature, aspect, priorFeatures, sharedContext);
      files[`prompts/${featureSlug}/${aspect.aspect}.md`] = generatedContent;
    });

    await Promise.all(aspectPromises);
  }

  return files;
}
