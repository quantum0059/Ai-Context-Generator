import { describe, it, expect } from "vitest";
import { filterAspectsAgainstConstraints, heuristicFeatureAspects, Aspect } from "../prompt-detector";
import type { ProjectSpec } from "../../../types/projectspec";

describe("prompt-detector", () => {
  const baseSpec: ProjectSpec = {
    id: "test-spec-001",
    projectName: "TestApp",
    description: "A test app",
    platform: "Web Application",
    features: ["Auth", "Dashboard"],
    requiredCategories: ["authentication", "frontendFramework"],
    stack: {},
    constraints: {},
    projectSpecVersion: "1.0.0",
  };

  const sampleAspects: Aspect[] = [
    { aspect: "ui-components", title: "UI", description: "UI" },
    { aspect: "api-routes", title: "API", description: "API" },
    { aspect: "authentication-integration", title: "Auth", description: "Auth" },
  ];

  describe("heuristicFeatureAspects", () => {
    it("returns CLI aspects for CLI platform", () => {
      const cliSpec = { ...baseSpec, platform: "CLI" };
      const aspects = heuristicFeatureAspects(cliSpec, "Command");
      expect(aspects).toHaveLength(2);
      expect(aspects[0].aspect).toBe("cli-commands");
      expect(aspects[1].aspect).toBe("core-logic");
    });

    it("returns API aspects for Backend API platform", () => {
      const apiSpec = { ...baseSpec, platform: "Backend API" };
      const aspects = heuristicFeatureAspects(apiSpec, "Endpoint");
      expect(aspects.map(a => a.aspect)).toContain("api-routes");
      expect(aspects.map(a => a.aspect)).toContain("core-logic");
    });

    it("returns UI and API aspects for fullstack Web Application", () => {
      // By default Web App with typical stack has UI + API
      const aspects = heuristicFeatureAspects(baseSpec, "Dashboard");
      expect(aspects.map(a => a.aspect)).toContain("ui-components");
      expect(aspects.map(a => a.aspect)).toContain("api-routes");
    });
  });

  describe("filterAspectsAgainstConstraints", () => {
    it("strips UI aspects from CLI projects", () => {
      const cliSpec = { ...baseSpec, platform: "CLI" };
      const filtered = filterAspectsAgainstConstraints(sampleAspects, cliSpec);
      expect(filtered.map(a => a.aspect)).not.toContain("ui-components");
    });

    it("strips auth aspects from offline desktop apps", () => {
      const offlineSpec = { ...baseSpec, platform: "Desktop Application", constraints: { technical: { mustBeOffline: true, mustUseLocalStorage: false, forbiddenCategories: [], forbiddenTools: [], requiredToolTypes: [], rawConstraints: [] } } };
      const filtered = filterAspectsAgainstConstraints(sampleAspects, offlineSpec);
      expect(filtered.map(a => a.aspect)).not.toContain("authentication-integration");
    });

    it("keeps all aspects if they are valid", () => {
      const filtered = filterAspectsAgainstConstraints(sampleAspects, baseSpec);
      expect(filtered).toHaveLength(sampleAspects.length);
    });

    it("falls back to core if all aspects are stripped", () => {
      const cliSpec = { ...baseSpec, platform: "CLI" };
      const uiOnly: Aspect[] = [{ aspect: "ui-components", title: "UI", description: "UI" }];
      const filtered = filterAspectsAgainstConstraints(uiOnly, cliSpec);
      // It should fall back to heuristic core logic / cli commands
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.map(a => a.aspect)).not.toContain("ui-components");
    });
  });
});
