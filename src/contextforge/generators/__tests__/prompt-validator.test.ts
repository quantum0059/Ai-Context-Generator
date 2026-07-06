import { describe, it, expect } from "vitest";
import { isPromptContentValid } from "../prompt-validator";

describe("isPromptContentValid", () => {
  it("returns true for a completely valid prompt", () => {
    const validContent = `
# Build: Core Feature
## Context
src/ and app/ exist.
- [ ] Acceptance Criteria met
## Definition of Done
Must be completely verified.
## Self-Verification
Verified!
We are implementing interface SomeThing { ... } for the auth feature.
${"a".repeat(500)} // pad to pass length requirement
    `;
    expect(isPromptContentValid(validContent, "Core Feature", "auth")).toBe(true);
  });

  it("returns false if placeholders are present", () => {
    const invalidContent = `
# Build: Core Feature
## Context
src/
- [ ] Acceptance Criteria
## Definition of Done
## Self-Verification
interface SomeThing { ... }
auth
// TODO: implement this
${"a".repeat(500)}
    `;
    expect(isPromptContentValid(invalidContent, "Core Feature", "auth")).toBe(false);
  });

  it("returns false if feature name is missing", () => {
    const invalidContent = `
# Build: Missing Feature Name
src/
- [ ] Acceptance Criteria
## Definition of Done
## Self-Verification
interface SomeThing { ... }
auth
${"a".repeat(500)}
    `;
    expect(isPromptContentValid(invalidContent, "Core Feature", "auth")).toBe(false);
  });

  it("returns false if too short", () => {
    const invalidContent = `
# Build: Core Feature
src/
- [ ] Acceptance Criteria
## Definition of Done
## Self-Verification
interface SomeThing { ... }
auth
    `;
    expect(isPromptContentValid(invalidContent, "Core Feature", "auth")).toBe(false);
  });
});
