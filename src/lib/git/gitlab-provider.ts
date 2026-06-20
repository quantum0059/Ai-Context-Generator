import type { PackageFiles } from "../../types/projectspec";
import type { AuthResult, GitProvider, Repository } from "./git-provider";

const API = "https://gitlab.com/api/v4";

/** HTTP status codes that indicate transient failures worth retrying. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

/** Standard headers for GitLab REST API v4. */
function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Throws a descriptive error when a GitLab API response is not OK. */
async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab ${context} failed (${res.status}): ${body}`);
  }
}

/**
 * Fetch wrapper with exponential-backoff retry for transient failures.
 * Only retries 429/500/502/503/504. Never retries 401/403/404/422.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  context: string,
): Promise<Response> {
  let lastRes: Response | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);

    if (res.ok || !RETRYABLE_STATUSES.has(res.status)) {
      return res;
    }

    lastRes = res;

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < MAX_RETRIES - 1) {
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted — throw with the last response
  const body = await lastRes!.text().catch(() => "");
  throw new Error(`GitLab ${context} failed after ${MAX_RETRIES} attempts (${lastRes!.status}): ${body}`);
}

/** Normalizes GitLab visibility strings to the union type. */
function normalizeVisibility(v: string): "public" | "private" {
  return v === "public" ? "public" : "private";
}

/**
 * GitLab implementation of the GitProvider interface.
 * Uses GitLab's OAuth 2.0 authorization code flow and REST API v4.
 */
export class GitLabProvider implements GitProvider {
  async authenticate(code: string): Promise<AuthResult> {
    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;
    const redirectUri = process.env.GITLAB_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET, and GITLAB_REDIRECT_URI must be set.");
    }

    // Exchange the authorization code for an access token
    const tokenRes = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`GitLab token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(
        `GitLab OAuth error: ${tokenData.error_description ?? tokenData.error ?? "unknown"}`,
      );
    }

    // Fetch the authenticated user's profile
    const userRes = await fetch(`${API}/user`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      throw new Error(`GitLab user fetch failed: ${userRes.status}`);
    }

    const userData = (await userRes.json()) as { id: number };

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : undefined,
      providerUserId: String(userData.id),
    };
  }

  // ---------------------------------------------------------------------------
  // List repositories (projects)
  // ---------------------------------------------------------------------------

  async listRepositories(
    accessToken: string,
    params?: { page?: number; search?: string },
  ): Promise<Repository[]> {
    const page = params?.page ?? 1;
    const qs = new URLSearchParams({
      membership: "true",
      per_page: "30",
      page: String(page),
      order_by: "updated_at",
      sort: "desc",
    });

    if (params?.search) {
      qs.set("search", params.search);
    }

    const res = await fetchWithRetry(
      `${API}/projects?${qs}`,
      { headers: headers(accessToken) },
      "list projects",
    );
    await assertOk(res, "list projects");

    type GLProject = {
      id: number;
      name: string;
      path_with_namespace: string;
      web_url: string;
      default_branch: string | null;
      visibility: string;
    };
    const projects = (await res.json()) as GLProject[];

    return projects.map((p) => ({
      id: String(p.id),
      name: p.name,
      fullName: p.path_with_namespace,
      url: p.web_url,
      defaultBranch: p.default_branch ?? "main",
      visibility: normalizeVisibility(p.visibility),
    }));
  }

  // ---------------------------------------------------------------------------
  // Create repository (project)
  // ---------------------------------------------------------------------------

  async createRepository(
    accessToken: string,
    opts: {
      name: string;
      description?: string;
      visibility: "public" | "private";
      initializeReadme: boolean;
    },
  ): Promise<Repository> {
    const res = await fetchWithRetry(
      `${API}/projects`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          name: opts.name,
          description: opts.description ?? "",
          visibility: opts.visibility,
          initialize_with_readme: opts.initializeReadme,
        }),
      },
      "create project",
    );
    await assertOk(res, "create project");

    const p = (await res.json()) as {
      id: number;
      name: string;
      path_with_namespace: string;
      web_url: string;
      default_branch: string | null;
      visibility: string;
    };

    return {
      id: String(p.id),
      name: p.name,
      fullName: p.path_with_namespace,
      url: p.web_url,
      defaultBranch: p.default_branch ?? "main",
      visibility: normalizeVisibility(p.visibility),
    };
  }

  // ---------------------------------------------------------------------------
  // Create branch
  // ---------------------------------------------------------------------------

  async createBranch(
    accessToken: string,
    repo: string,
    branchName: string,
    fromBranch: string,
  ): Promise<void> {
    const encodedRepo = encodeURIComponent(repo);
    const res = await fetchWithRetry(
      `${API}/projects/${encodedRepo}/repository/branches`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          branch: branchName,
          ref: fromBranch,
        }),
      },
      `create branch ${branchName}`,
    );
    await assertOk(res, `create branch ${branchName}`);
  }

  // ---------------------------------------------------------------------------
  // Delete branch (best-effort cleanup)
  // ---------------------------------------------------------------------------

  async deleteBranch(
    accessToken: string,
    repo: string,
    branchName: string,
  ): Promise<void> {
    const encodedRepo = encodeURIComponent(repo);
    const res = await fetch(
      `${API}/projects/${encodedRepo}/repository/branches/${encodeURIComponent(branchName)}`,
      {
        method: "DELETE",
        headers: headers(accessToken),
      },
    );
    // Best-effort — don't throw on failure
    if (!res.ok) {
      console.error(`GitLab delete branch ${branchName} failed (${res.status})`);
    }
  }

  // ---------------------------------------------------------------------------
  // Commit files (Commits API — single request with correct create/update actions)
  // ---------------------------------------------------------------------------

  async commitFiles(
    accessToken: string,
    repo: string,
    branch: string,
    files: PackageFiles,
    message: string,
  ): Promise<{ commitSha: string }> {
    const encodedRepo = encodeURIComponent(repo);
    const hdrs = headers(accessToken);

    // Query the repository tree to determine which files already exist.
    // This is necessary to build a single actions[] array with correct
    // "create" vs "update" actions — avoids the mixed-file bug where
    // using all-create or all-update fails when both new and existing
    // files are present in the same commit.
    const existingPaths = new Set<string>();
    const filePaths = Object.keys(files);

    // Fetch tree entries recursively for the branch
    const treeRes = await fetchWithRetry(
      `${API}/projects/${encodedRepo}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100`,
      { headers: hdrs },
      "get repository tree",
    );

    if (treeRes.ok) {
      type TreeEntry = { path: string; type: string };
      const treeEntries = (await treeRes.json()) as TreeEntry[];
      for (const entry of treeEntries) {
        if (entry.type === "blob") {
          existingPaths.add(entry.path);
        }
      }
    }
    // If tree fetch fails (e.g. empty repo), treat all files as new

    // Build a single actions array with the correct action per file
    const actions = filePaths.map((path) => ({
      action: existingPaths.has(path) ? ("update" as const) : ("create" as const),
      file_path: path,
      content: Buffer.from(files[path], "utf8").toString("base64"),
      encoding: "base64" as const,
    }));

    const res = await fetchWithRetry(
      `${API}/projects/${encodedRepo}/repository/commits`,
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          branch,
          commit_message: message,
          actions,
        }),
      },
      "commit files",
    );
    await assertOk(res, "commit files");

    const data = (await res.json()) as { id: string };
    return { commitSha: data.id };
  }

  // ---------------------------------------------------------------------------
  // Create merge request
  // ---------------------------------------------------------------------------

  async createPullRequest(
    accessToken: string,
    repo: string,
    fromBranch: string,
    toBranch: string,
    title: string,
  ): Promise<{ url: string }> {
    const encodedRepo = encodeURIComponent(repo);
    const res = await fetchWithRetry(
      `${API}/projects/${encodedRepo}/merge_requests`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          source_branch: fromBranch,
          target_branch: toBranch,
          title,
        }),
      },
      "create merge request",
    );
    await assertOk(res, "create merge request");

    const mr = (await res.json()) as { web_url: string };
    return { url: mr.web_url };
  }
}
