import type { ProjectSpec } from "../../types/projectspec";

export function generateMcpToolDefinition(
  spec: ProjectSpec,
  files: Record<string, string>
): string {
  // Derive available tools from the actual files that were generated
  const featureNames = spec.features;

  const availablePrompts = Object.keys(files)
    .filter(p => p.startsWith('prompts/'))
    .map(p => ({
      path: p,
      feature: p.split('/')[1],
      aspect: p.split('/')[2]?.replace('.md', '')
    }));

  const availableSkills = Object.keys(files)
    .filter(p => p.startsWith('skills/'))
    .map(p => p.split('/')[1])
    .filter((v, i, a) => a.indexOf(v) === i);

  const availableManifests = Object.keys(files)
    .filter(p => p.startsWith('context-manifests/') && p.endsWith('.json'))
    .map(p => p.split('/')[1].replace('.json', ''));

  const definition = {
    name: `${spec.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-context`,
    version: '1.0.0',
    description: `AI development context package for ${spec.projectName}. Provides architecture rules, implementation prompts, and feature guides for AI-assisted development.`,
    startHere: 'agents.md',
    buildOrder: 'dependency-graph.json',
    projectContext: 'ai-context.json',
    tools: [
      {
        name: 'get_project_constitution',
        description: `Returns the architecture rules and AI constraints for ${spec.projectName}. Always load this first in any AI session.`,
        inputSchema: { type: 'object', properties: {} },
        returnsFile: 'agents.md'
      },
      {
        name: 'get_build_order',
        description: `Returns the recommended feature build order and dependencies for ${spec.projectName}.`,
        inputSchema: { type: 'object', properties: {} },
        returnsFile: 'dependency-graph.json'
      },
      {
        name: 'get_feature_manifest',
        description: `Returns the executable task definition for a specific feature including files to create, acceptance criteria, and test cases. Available features: ${availableManifests.join(', ')}`,
        inputSchema: {
          type: 'object',
          properties: {
            feature: {
              type: 'string',
              enum: availableManifests,
              description: 'The feature to get the manifest for'
            }
          },
          required: ['feature']
        },
        returnsFile: 'context-manifests/{feature}.json'
      },
      {
        name: 'get_implementation_prompt',
        description: `Returns the implementation prompt for a specific feature aspect. Available: ${availablePrompts.map(p => `${p.feature}/${p.aspect}`).join(', ')}`,
        inputSchema: {
          type: 'object',
          properties: {
            feature: {
              type: 'string',
              enum: Array.from(new Set(availablePrompts.map(p => p.feature)))
            },
            aspect: {
              type: 'string',
              description: 'The implementation aspect'
            }
          },
          required: ['feature', 'aspect']
        },
        returnsFile: 'prompts/{feature}/{aspect}.md'
      },
      {
        name: 'get_technology_skill',
        description: `Returns detailed usage documentation for a technology in this project's stack. Available: ${availableSkills.join(', ')}`,
        inputSchema: {
          type: 'object',
          properties: {
            technology: {
              type: 'string',
              enum: availableSkills
            }
          },
          required: ['technology']
        },
        returnsFile: 'skills/{technology}/skill.md'
      },
      {
        name: 'get_architecture_decision',
        description: `Returns the Architecture Decision Record explaining why a technology was chosen and how to use it correctly.`,
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'The technology category (e.g. authentication, database)'
            }
          },
          required: ['category']
        },
        returnsFile: 'decisions/{adr-file}.md'
      }
    ],
    recommendedSessionStart: [
      'agents.md',
      'ai-context.json',
      'dependency-graph.json'
    ],
    featureWorkflow: featureNames.map(feature => ({
      feature,
      step1: `Load context-manifests/${feature}.json`,
      step2: `Review acceptance_criteria and files_to_create`,
      step3: `Load each file in load_before_starting`,
      step4: `Use prompts/${feature}/ in order`,
      step5: `Verify against acceptance_criteria`
    }))
  };

  const jsonString = JSON.stringify(definition, null, 2);
  JSON.parse(jsonString); // Validation step
  return jsonString;
}
