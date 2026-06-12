import { describe, expect, it } from "vitest";
import { TECHNOLOGIES } from "../src/registry/technologies";

describe("technology registry", () => {
  it("has unique ids", () => {
    const ids = TECHNOLOGIES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has the required fields", () => {
    for (const t of TECHNOLOGIES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.pricing.length).toBeGreaterThan(0);
      expect(t.docsUrl).toMatch(/^https:\/\//);
      expect(t.pros.length).toBeGreaterThan(0);
      expect(t.cons.length).toBeGreaterThan(0);
      expect(t.installCommands.length).toBeGreaterThan(0);
      expect(t.platforms.length).toBeGreaterThan(0);
    }
  });
});
