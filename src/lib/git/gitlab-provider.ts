import type { PackageFiles } from "../../types/projectspec";
import type { AuthResult, GitProvider, Repository } from "./git-provider";

const API = "https://gitlab.com/api/v4";

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

    const res = await fetch(`${API}/projects?${qs}`, {
      headers: headers(accessToken),
    });
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
    const res = await fetch(`${API}/projects`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        name: opts.name,
        description: opts.description ?? "",
        visibility: opts.visibility,
        initialize_with_readme: opts.initializeReadme,
      }),
    });
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
    const res = await fetch(`${API}/projects/${encodedRepo}/repository/branches`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        branch: branchName,
        ref: fromBranch,
      }),
    });
    await assertOk(res, `create branch ${branchName}`);
  }

  // ---------------------------------------------------------------------------
  // Commit files (Commits API — single request with actions array)
  // ---------------------------------------------------------------------------

  async commitFiles(
    accessToken: string,
    repo: string,
    branch: string,
    files: PackageFiles,
    message: string,
  ): Promise<{ commitSha: string }> {
    const encodedRepo = encodeURIComponent(repo);

    // Build actions array — one entry per file
    // We use "create" action with force: true which will create or overwrite
    const actions = Object.entries(files).map(([path, content]) => ({
      action: "create" as const,
      file_path: path,
      content: Buffer.from(content, "utf8").toString("base64"),
      encoding: "base64" as const,
    }));

    const res = await fetch(`${API}/projects/${encodedRepo}/repository/commits`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        branch,
        commit_message: message,
        actions,
      }),
    });

    // If any file already exists, GitLab returns 400. Retry with "update" action.
    if (res.status === 400) {
      const updateActions = Object.entries(files).map(([path, content]) => ({
        action: "update" as const,
        file_path: path,
        content: Buffer.from(content, "utf8").toString("base64"),
        encoding: "base64" as const,
      }));

      const retryRes = await fetch(`${API}/projects/${encodedRepo}/repository/commits`, {
        method: "POST",
        headers: headers(accessToken),
        body: JSON.stringify({
          branch,
          commit_message: message,
          actions: updateActions,
        }),
      });
      await assertOk(retryRes, "commit files (update)");
      const data = (await retryRes.json()) as { id: string };
      return { commitSha: data.id };
    }

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
    const res = await fetch(`${API}/projects/${encodedRepo}/merge_requests`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        source_branch: fromBranch,
        target_branch: toBranch,
        title,
      }),
    });
    await assertOk(res, "create merge request");

    const mr = (await res.json()) as { web_url: string };
    return { url: mr.web_url };
  }
}
