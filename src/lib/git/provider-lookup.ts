import type { GitProvider } from "./git-provider";
import { GitHubProvider } from "./github-provider";
import { GitLabProvider } from "./gitlab-provider";

const VALID_PROVIDERS = new Set(["github", "gitlab"]);

/** Type guard: is the value a supported git provider slug? */
export function isValidProvider(value: string): value is "github" | "gitlab" {
  return VALID_PROVIDERS.has(value);
}

/** Returns the matching GitProvider implementation for a validated provider slug. */
export function getGitProvider(provider: "github" | "gitlab"): GitProvider {
  switch (provider) {
    case "github":
      return new GitHubProvider();
    case "gitlab":
      return new GitLabProvider();
  }
}
