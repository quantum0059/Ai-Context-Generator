import type { PackageFiles } from "../../types/projectspec";
import type { AuthResult, GitProvider, Repository } from "./git-provider";

const API = "https://api.github.com";

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
 * GitHub implementation of the GitProvider interface.
 * Uses GitHub's OAuth web application flow and REST API v3.
 */
export class GitHubProvider implements GitProvider {
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

    const res = await fetch(`${API}/user/repos?${qs}`, {
      headers: headers(accessToken),
    });
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
    const res = await fetch(`${API}/user/repos`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        name: opts.name,
        description: opts.description ?? "",
        private: opts.visibility === "private",
        auto_init: opts.initializeReadme,
      }),
    });
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
    const refRes = await fetch(
      `${API}/repos/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`,
      { headers: headers(accessToken) },
    );
    await assertOk(refRes, `get ref heads/${fromBranch}`);
    const refData = (await refRes.json()) as { object: { sha: string } };

    // 2. Create new branch ref
    const createRes = await fetch(`${API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      }),
    });
    await assertOk(createRes, `create branch ${branchName}`);
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
    const refRes = await fetch(
      `${API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      { headers: hdrs },
    );
    await assertOk(refRes, `get ref heads/${branch}`);
    const refData = (await refRes.json()) as { object: { sha: string } };
    const parentSha = refData.object.sha;

    // 2. Get the base tree SHA
    const commitRes = await fetch(`${API}/repos/${repo}/git/commits/${parentSha}`, {
      headers: hdrs,
    });
    await assertOk(commitRes, "get parent commit");
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const [path, content] of Object.entries(files)) {
      const blobRes = await fetch(`${API}/repos/${repo}/git/blobs`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          content: Buffer.from(content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      });
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
    const treeRes = await fetch(`${API}/repos/${repo}/git/trees`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    });
    await assertOk(treeRes, "create tree");
    const treeData = (await treeRes.json()) as { sha: string };

    // 5. Create commit
    const newCommitRes = await fetch(`${API}/repos/${repo}/git/commits`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        message,
        tree: treeData.sha,
        parents: [parentSha],
      }),
    });
    await assertOk(newCommitRes, "create commit");
    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // 6. Update branch ref to point at new commit
    const updateRefRes = await fetch(
      `${API}/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ sha: newCommitData.sha }),
      },
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
    const res = await fetch(`${API}/repos/${repo}/pulls`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        title,
        head: fromBranch,
        base: toBranch,
      }),
    });
    await assertOk(res, "create pull request");

    const pr = (await res.json()) as { html_url: string };
    return { url: pr.html_url };
  }
}
