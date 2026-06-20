import type { PackageFiles } from "../../types/projectspec";

/** Normalized repository shape returned by all git providers. */
export interface Repository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  visibility: "public" | "private";
}

/** OAuth token exchange result. */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  providerUserId: string;
}

/**
 * Abstraction layer over git hosting providers (GitHub, GitLab, etc.).
 * Each provider implements this interface to normalize OAuth flows and
 * repository operations.
 */
export interface GitProvider {
  authenticate(code: string): Promise<AuthResult>;

  listRepositories(
    accessToken: string,
    params?: { page?: number; search?: string },
  ): Promise<Repository[]>;

  createRepository(
    accessToken: string,
    opts: {
      name: string;
      description?: string;
      visibility: "public" | "private";
      initializeReadme: boolean;
    },
  ): Promise<Repository>;

  createBranch(
    accessToken: string,
    repo: string,
    branchName: string,
    fromBranch: string,
  ): Promise<void>;

  commitFiles(
    accessToken: string,
    repo: string,
    branch: string,
    files: PackageFiles,
    message: string,
  ): Promise<{ commitSha: string }>;

  createPullRequest(
    accessToken: string,
    repo: string,
    fromBranch: string,
    toBranch: string,
    title: string,
  ): Promise<{ url: string }>;
}
