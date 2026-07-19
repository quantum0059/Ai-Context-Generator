import { test, expect } from "vitest";
import { discoverCategories } from "../src/contextforge/discovery";
import { extractArchitecturalRequirements } from "../src/contextforge/requirement-extractor";
import type { DraftInput } from "../src/types/projectspec";

// A deliberately complex, multi-faceted project designed to trigger 
// a massive amount of functional requirements and edge cases.
const MASSIVE_PROJECT: DraftInput = {
  projectName: "Global Omni-Commerce & Logistics Engine",
  platform: "web",
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
    technical: {
      forbiddenTools: [],
      forbiddenCategories: [],
      requiredToolTypes: ["Enterprise Database", "Global CDN", "Realtime PubSub"],
      mustBeOffline: true,
      mustUseLocalStorage: true,
      rawConstraints: ["Must scale to 10M DAU", "99.999% uptime"],
      compliance: ["GDPR", "CCPA", "KYC", "AML", "PCI-DSS"],
    }
  }
};

test("discoverCategories completes successfully without truncation", async () => {
  const result = await discoverCategories(MASSIVE_PROJECT);
  expect(result).toBeDefined();
  expect(result.projectType).toBeDefined();
  expect(result.requiredCategories.length).toBeGreaterThan(0);
  console.log(`[TEST] Discovered project type: ${result.projectType}`);
  expect(result.technicalConstraints).toBeDefined();
  expect(result.technicalConstraints?.mustBeOffline).toBe(true);
  expect(result.technicalConstraints?.mustUseLocalStorage).toBe(true);
  expect(result.architecturalRequirements).toBeUndefined();
}, 60000);
