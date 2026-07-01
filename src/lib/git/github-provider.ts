import type { PackageFiles } from "../../types/projectspec";
import type { AuthResult, GitProvider, Repository, TreeEntry } from "./git-provider";

const API = "https://api.github.com";

/** HTTP status codes that indicate transient failures worth retrying. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

/** Standard headers for GitHub REST API v3. */
function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/** Throws a descriptive error when a GitHub API response is not OK. */
async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${context} failed (${res.status}): ${body}`);
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
  throw new Error(`GitHub ${context} failed after ${MAX_RETRIES} attempts (${lastRes!.status}): ${body}`);
}

/**
 * GitHub implementation of the GitProvider interface.
 * Uses GitHub's OAuth web application flow and REST API v3.
 */
export class GitHubProvider implements GitProvider {
  // ---------------------------------------------------------------------------
  // List repository file tree (recursive, single request)
  // ---------------------------------------------------------------------------

  async listTree(
    accessToken: string,
    repo: string,
    ref?: string,
  ): Promise<TreeEntry[]> {
    const branch = ref ?? "HEAD";

    // Resolve the branch/ref to a commit + tree SHA, then fetch recursively.
    const treeRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: headers(accessToken) },
      "list repository tree",
    );
    await assertOk(treeRes, "list repository tree");

    const data = (await treeRes.json()) as {
      tree?: Array<{ path: string; type: string }>;
    };

    return (data.tree ?? []).map((e) => ({
      path: e.path,
      type: e.type === "tree" ? ("tree" as const) : ("blob" as const),
    }));
  }

  async authenticate(code: string): Promise<AuthResult> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set.");
    }

    // Exchange the authorization code for an access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`GitHub token exchange failed: ${tokenRes.status}`);
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
        `GitHub OAuth error: ${tokenData.error_description ?? tokenData.error ?? "unknown"}`,
      );
    }

    // Fetch the authenticated user's profile
    const userRes = await fetch(`${API}/user`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!userRes.ok) {
      throw new Error(`GitHub user fetch failed: ${userRes.status}`);
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
  // List repositories
  // ---------------------------------------------------------------------------

  async listRepositories(
    accessToken: string,
    params?: { page?: number; search?: string },
  ): Promise<Repository[]> {
    const page = params?.page ?? 1;
    const qs = new URLSearchParams({
      per_page: "30",
      page: String(page),
      sort: "updated",
      direction: "desc",
      affiliation: "owner,collaborator,organization_member",
    });

    const res = await fetchWithRetry(
      `${API}/user/repos?${qs}`,
      { headers: headers(accessToken) },
      "list repos",
    );
    await assertOk(res, "list repos");

    type GHRepo = {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      default_branch: string;
      private: boolean;
    };
    const repos = (await res.json()) as GHRepo[];

    let mapped: Repository[] = repos.map((r) => ({
      id: String(r.id),
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      defaultBranch: r.default_branch,
      visibility: r.private ? "private" : "public",
    }));

    // Client-side substring filter when search is provided
    if (params?.search) {
      const q = params.search.toLowerCase();
      mapped = mapped.filter(
        (r) => r.name.toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q),
      );
    }

    return mapped;
  }

  // ---------------------------------------------------------------------------
  // Create repository
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
      `${API}/user/repos`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          name: opts.name,
          description: opts.description ?? "",
          private: opts.visibility === "private",
          auto_init: opts.initializeReadme,
        }),
      },
      "create repo",
    );
    await assertOk(res, "create repo");

    const r = (await res.json()) as {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      default_branch: string;
      private: boolean;
    };

    return {
      id: String(r.id),
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      defaultBranch: r.default_branch,
      visibility: r.private ? "private" : "public",
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
    // 1. Get the SHA of the source branch
    const refRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`,
      { headers: headers(accessToken) },
      `get ref heads/${fromBranch}`,
    );
    await assertOk(refRes, `get ref heads/${fromBranch}`);
    const refData = (await refRes.json()) as { object: { sha: string } };

    // 2. Create new branch ref
    const createRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/refs`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: refData.object.sha,
        }),
      },
      `create branch ${branchName}`,
    );
    await assertOk(createRes, `create branch ${branchName}`);
  }

  // ---------------------------------------------------------------------------
  // Delete branch (best-effort cleanup)
  // ---------------------------------------------------------------------------

  async deleteBranch(
    accessToken: string,
    repo: string,
    branchName: string,
  ): Promise<void> {
    const res = await fetch(
      `${API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
      {
        method: "DELETE",
        headers: headers(accessToken),
      },
    );
    // Best-effort — don't throw on failure
    if (!res.ok) {
      console.error(`GitHub delete branch ${branchName} failed (${res.status})`);
    }
  }

  // ---------------------------------------------------------------------------
  // Commit files (Git Data API — batch tree+commit)
  // ---------------------------------------------------------------------------

  async commitFiles(
    accessToken: string,
    repo: string,
    branch: string,
    files: PackageFiles,
    message: string,
  ): Promise<{ commitSha: string }> {
    const hdrs = headers(accessToken);

    // 1. Get current commit SHA for the branch
    const refRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      { headers: hdrs },
      `get ref heads/${branch}`,
    );
    await assertOk(refRes, `get ref heads/${branch}`);
    const refData = (await refRes.json()) as { object: { sha: string } };
    const parentSha = refData.object.sha;

    // 2. Get the base tree SHA
    const commitRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/commits/${parentSha}`,
      { headers: hdrs },
      "get parent commit",
    );
    await assertOk(commitRes, "get parent commit");
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const [path, content] of Object.entries(files)) {
      const blobRes = await fetchWithRetry(
        `${API}/repos/${repo}/git/blobs`,
        {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            content: Buffer.from(content, "utf8").toString("base64"),
            encoding: "base64",
          }),
        },
        `create blob ${path}`,
      );
      await assertOk(blobRes, `create blob ${path}`);
      const blobData = (await blobRes.json()) as { sha: string };
      treeEntries.push({
        path,
        mode: "100644",
        type: "blob",
        sha: blobData.sha,
      });
    }

    // 4. Create tree (batch — single API call for the tree)
    const treeRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/trees`,
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      },
      "create tree",
    );
    await assertOk(treeRes, "create tree");
    const treeData = (await treeRes.json()) as { sha: string };

    // 5. Create commit
    const newCommitRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/commits`,
      {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          message,
          tree: treeData.sha,
          parents: [parentSha],
        }),
      },
      "create commit",
    );
    await assertOk(newCommitRes, "create commit");
    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // 6. Update branch ref to point at new commit
    const updateRefRes = await fetchWithRetry(
      `${API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ sha: newCommitData.sha }),
      },
      "update branch ref",
    );
    await assertOk(updateRefRes, "update branch ref");

    return { commitSha: newCommitData.sha };
  }

  // ---------------------------------------------------------------------------
  // Create pull request
  // ---------------------------------------------------------------------------

  async createPullRequest(
    accessToken: string,
    repo: string,
    fromBranch: string,
    toBranch: string,
    title: string,
  ): Promise<{ url: string }> {
    const res = await fetchWithRetry(
      `${API}/repos/${repo}/pulls`,
      {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          title,
          head: fromBranch,
          base: toBranch,
        }),
      },
      "create pull request",
    );
    await assertOk(res, "create pull request");

    const pr = (await res.json()) as { html_url: string };
    return { url: pr.html_url };
  }
}
