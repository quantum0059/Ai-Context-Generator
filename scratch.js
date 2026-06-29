const { z } = require("zod");
const schema = z.object({
  projectName: z.string().min(1),
  description: z.string().min(10),
  platform: z.string().min(1),
  features: z.array(z.string()).default([]),
  constraints: z
    .object({ budget: z.string().optional(), avoid: z.array(z.string()).optional() })
    .default({}),
  designReferences: z.array(z.string()).optional(),
  projectType: z.string().optional(),
  classificationReason: z.string().optional(),
});

console.log(schema.safeParse({
  projectName: "Test",
  description: "Test description is long enough",
  platform: "web",
  features: [],
  constraints: { budget: undefined, avoid: [] },
  projectType: undefined,
  classificationReason: undefined,
}).success);
