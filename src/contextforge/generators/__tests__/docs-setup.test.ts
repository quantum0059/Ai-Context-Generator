import { describe, it, expect } from "vitest";
import { getInstallCommands } from "../docs-setup";

describe("docs-setup", () => {
  describe("getInstallCommands", () => {
    it("returns npm install fallback when auto-generation is bypassed", async () => {
      // In a test environment without a Claude API key, it should immediately fallback
      const commands = await getInstallCommands("some-unknown-tool", "Web Application", false);
      expect(commands).toContain("npm install some-unknown-tool");
    });

    it("cleans package name for fallback", async () => {
      const commands = await getInstallCommands("react + react-dom", "Web Application", false);
      expect(commands).toContain("npm install react");
    });
  });
});
