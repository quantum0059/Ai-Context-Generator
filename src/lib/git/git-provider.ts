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

/** A single entry in a repository's file tree. */
export interface TreeEntry {
  /** Full path relative to the repo root, e.g. "src/lib/utils.ts". */
  path: string;
  /** "blob" for files, "tree" for directories. */
  type: "blob" | "tree";
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

  /**
   * Returns the recursive file tree of a repository at a given ref.
   * Used to render the connected repo's real structure in the context map.
   */
  listTree(
    accessToken: string,
    repo: string,
    ref?: string,
  ): Promise<TreeEntry[]>;

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

  /** Best-effort branch deletion for cleanup after failed operations. */
  deleteBranch(
    accessToken: string,
    repo: string,
    branchName: string,
  ): Promise<void>;
}
