require("dotenv").config();
const { groqJson } = require("./src/lib/groq");
const z = require("zod");

const discoverySchema = z.object({
  projectType: z.enum([
    "UI_APPLICATION",
    "HEADLESS_ENGINE",
    "BACKEND_API",
    "CLI_TOOL",
    "LIBRARY_OR_SDK",
    "HYBRID",
  ]),
  classificationReason: z.string(),
  requiredCategories: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      reason: z.string(),
      relevantToProjectType: z.boolean(),
    }),
  ).min(1)
});

async function run() {
  try {
    const res = await groqJson("First, state the project type classification and your one-sentence reasoning. Then return a JSON object: { \"projectType\": \"UI_APPLICATION\" ... }", discoverySchema);
    console.log(res);
  } catch(e) {
    console.log("FAILED:", e);
  }
}
run();
