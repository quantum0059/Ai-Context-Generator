import { extractProjectConstraints } from "./src/contextforge/constraint-extractor";
import { discoverCategories } from "./src/contextforge/discovery";
import { suggestForCategory } from "./src/contextforge/suggestions";
import type { DraftInput } from "./src/types/projectspec";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function run() {
  const description = "A fully offline code analysis engine that runs locally with no internet connection, uses an AST parser to analyze code structure, and stores all data in a local SQLite database. No external APIs.";
  const platform = "desktop";

  const draft: DraftInput = {
    projectName: "Offline Analyzer",
    description,
    platform,
    features: [],
    constraints: {},
  };

  console.log("Running discoverCategories...");
  const result = await discoverCategories(draft);
  console.log("Categories discovered:", result.requiredCategories);

  console.log("\nTesting suggestions for 'database'...");
  const suggestions = await suggestForCategory("database", draft);
  console.log("Database Suggestions:", JSON.stringify(suggestions.candidates, null, 2));

  console.log("\nTesting suggestions for AST parsing...");
  // Let's see if AST parsing was discovered
  const astCategory = result.requiredCategories.find(c => c.toLowerCase().includes("ast") || c.toLowerCase().includes("parser") || c.toLowerCase().includes("parsing"));
  if (astCategory) {
    const astSuggestions = await suggestForCategory(astCategory, draft);
    console.log("AST Suggestions:", JSON.stringify(astSuggestions.candidates, null, 2));
  }
}

run().catch(console.error);
