import { discoverCategories } from "../src/contextforge/discovery";
import { extractArchitecturalRequirements } from "../src/contextforge/requirement-extractor";

// A deliberately complex, multi-faceted project designed to trigger 
// a massive amount of functional requirements and edge cases.
const MASSIVE_PROJECT = {
  projectName: "Global Omni-Commerce & Logistics Engine",
  platform: "web-and-mobile-hybrid",
  description: `We are building a massive enterprise-grade global e-commerce and logistics platform. 
It must handle B2B wholesale, B2C retail, and C2C marketplace sales simultaneously. 
Key components:
1. Multi-vendor marketplace with real-time commission splitting, tax calculation (VAT, GST, State Tax), and localized currency conversion.
2. AI-driven predictive logistics: real-time GPS tracking of delivery drivers, route optimization, warehouse inventory forecasting, and automated drone dispatch integration.
3. Social commerce: users can live-stream products, create affiliate links, post video reviews, and chat in real-time with vendors.
4. Fintech layer: built-in digital wallet, crypto payments, BNPL (Buy Now Pay Later) integration, and automated seller payouts.
5. Administrative backend: full RBAC, fraud detection AI, KYC/AML verification workflows, support ticketing, and GDPR/CCPA automated compliance.
6. Offline mode: mobile apps must support offline catalogue browsing and syncing carts when connection is restored.
It needs to scale to 10 million daily active users with 99.999% uptime.`,
  features: [
    "multi-vendor", "commission splitting", "live streaming", "real-time chat", 
    "crypto payments", "BNPL", "GPS tracking", "route optimization", 
    "fraud detection", "KYC", "offline mode", "support ticketing", "inventory forecasting"
  ],
  constraints: {
    forbiddenTools: [],
    forbiddenCategories: [],
    requiredToolTypes: ["Enterprise Database", "Global CDN", "Realtime PubSub"],
    mustBeOffline: true,
    mustUseLocalStorage: true,
    rawConstraints: ["Must scale to 10M DAU", "99.999% uptime"],
    compliance: ["GDPR", "CCPA", "KYC", "AML", "PCI-DSS"],
  }
};

async function runTest() {
  console.log("=== 1. Testing discoverCategories (maxTokens: 1200) ===");
  try {
    const start = Date.now();
    const result = await discoverCategories(MASSIVE_PROJECT);
    console.log(`✅ Success in ${Date.now() - start}ms`);
    console.log(`- Project Type: ${result.projectType}`);
    console.log(`- Categories Found: ${result.requiredCategories.length}`);
  } catch (err) {
    console.error("❌ Failed discoverCategories:");
    console.error(err);
  }

  console.log("\n=== 2. Testing extractArchitecturalRequirements (maxTokens: 2500) ===");
  try {
    const start = Date.now();
    const result = await extractArchitecturalRequirements(
      MASSIVE_PROJECT.description, 
      MASSIVE_PROJECT.platform, 
      MASSIVE_PROJECT.projectName
    );
    console.log(`✅ Success in ${Date.now() - start}ms`);
    console.log(`- Functional Requirements: ${result.functional.length}`);
    console.log(`- Edge Cases: ${result.edgeCases.length}`);
    
    // Check if it fell back to heuristics due to a Zod parse error (truncation)
    if (result.functional.length < 5) {
      console.log("⚠️ WARNING: This looks like a heuristic fallback. The AI likely truncated, failed Zod validation, and gracefully fell back.");
    } else {
      console.log("🔥 AI extraction succeeded without truncation!");
    }
  } catch (err) {
    console.error("❌ Failed extractArchitecturalRequirements:");
    console.error(err);
  }
}

// Make sure Groq is configured
if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY is not set.");
  process.exit(1);
}

runTest();
