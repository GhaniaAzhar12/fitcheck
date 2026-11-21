import "server-only";

import { Octokit } from "@octokit/rest";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** A message that is safe to show the user as-is. */
export class GitHubError extends Error {}

export type Repo = {
  fullName: string; // "owner/name"
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  fork: boolean;
  pushedAt: string | null;
};

/** An Octokit client using the signed-in user's GitHub token. */
export async function githubFor(userId: string): Promise<Octokit> {
  const account = await db.account.findFirst({
    where: { userId, providerId: "github" },
    select: { id: true },
  });
  if (!account) {
    throw new GitHubError(
      "No GitHub account is linked. Sign out and sign in with GitHub.",
    );
  }

  let accessToken: string | undefined;
  try {
    // Refreshes the token first if GitHub issued an expiring one.
    const token = await auth.api.getAccessToken({
      body: { accountId: account.id, userId },
      headers: await headers(),
    });
    accessToken = token.accessToken;
  } catch {
    accessToken = undefined;
  }
  if (!accessToken) {
    throw new GitHubError(
      "Your GitHub login has expired. Sign out and sign in again.",
    );
  }

  return new Octokit({ auth: accessToken, userAgent: "fitcheck" });
}

/** The user's own public, non-archived repos, most recently pushed first. */
export async function listPublicRepos(userId: string): Promise<Repo[]> {
  const octokit = await githubFor(userId);
  try {
    const repos = await octokit.paginate(
      octokit.rest.repos.listForAuthenticatedUser,
      {
        visibility: "public",
        affiliation: "owner",
        sort: "pushed",
        per_page: 100,
      },
    );
    return repos
      .filter((r) => !r.archived && !r.private)
      .map((r) => ({
        fullName: r.full_name,
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        fork: r.fork,
        pushedAt: r.pushed_at ?? null,
      }));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      throw new GitHubError(
        "Your GitHub login has expired. Sign out and sign in again.",
      );
    }
    if (status === 403 || status === 429) {
      throw new GitHubError(
        "GitHub is rate-limiting us. Try again in a few minutes.",
      );
    }
    throw new GitHubError(
      "We couldn't load your repos from GitHub. Try again.",
    );
  }
}
