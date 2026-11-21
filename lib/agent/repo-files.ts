// Listing and reading files in a GitHub repo, used by the
// list_repo_files and read_file tools. GitHub is reached through the small
// RepoApi interface so tests can pass a fake instead of the network.

import type { Octokit } from "@octokit/rest";

export type TreeEntry = { path: string; size: number };

export interface RepoApi {
  /** Files (not folders) on the repo's default branch. */
  listTree(repo: string): Promise<TreeEntry[]>;
  /** A file's text, or null if it is missing, binary or too large. */
  readText(repo: string, path: string): Promise<string | null>;
}

export const MAX_FILES = 200;
export const MAX_LINES = 300;
const MAX_FILE_BYTES = 200_000;
const MAX_LINE_CHARS = 300;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".turbo",
  ".vercel",
  "__pycache__",
  ".venv",
  "venv",
  "generated",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "Cargo.lock",
  "composer.lock",
  ".DS_Store",
]);

const SOURCE_EXT = new Set(
  "ts tsx js jsx mjs cjs py go rs java kt rb php cs swift dart sql prisma graphql gql css scss html md mdx json yml yaml toml sh vue svelte astro".split(
    " ",
  ),
);

const SPECIAL_NAMES = new Set(["Dockerfile", "Makefile", "Procfile"]);

export function isSourceFile(entry: TreeEntry): boolean {
  if (entry.size > MAX_FILE_BYTES) return false;
  const parts = entry.path.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;
  const name = parts[parts.length - 1] ?? "";
  if (SKIP_FILES.has(name) || name.endsWith(".min.js")) return false;
  if (SPECIAL_NAMES.has(name)) return true;
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return Boolean(ext && SOURCE_EXT.has(ext));
}

/** Lower number = listed first: overview files, then shallow paths. */
function priority(path: string): number {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (path.toLowerCase() === "readme.md") return 0;
  if (path === "package.json" || name === "schema.prisma") return 1;
  return 2 + path.split("/").length;
}

/** Source files only, most useful first, capped at MAX_FILES. */
export function pickSourceFiles(tree: TreeEntry[]) {
  const source = tree
    .filter(isSourceFile)
    .map((e) => e.path)
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
  return {
    files: source.slice(0, MAX_FILES),
    total: source.length,
    truncated: source.length > MAX_FILES,
  };
}

/** Rejects paths that try to escape the repo or look malformed. */
export function normalizePath(path: string): string | null {
  const clean = path.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (!clean || clean.includes("\\") || clean.includes("\0")) return null;
  if (clean.split("/").some((part) => part === ".." || part === "."))
    return null;
  return clean;
}

/** First maxLines lines, numbered so evidence can cite "file:line". */
export function numberLines(text: string, maxLines = MAX_LINES) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const shown = lines.slice(0, maxLines).map((line, i) => {
    const cut =
      line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
    return `${String(i + 1).padStart(4)}| ${cut}`;
  });
  return {
    content: shown.join("\n"),
    totalLines: lines.length,
    truncated: lines.length > maxLines,
  };
}

/** RepoApi backed by the GitHub REST API. */
export function octokitRepoApi(octokit: Octokit): RepoApi {
  const split = (repo: string) => {
    const [owner, name] = repo.split("/");
    if (!owner || !name) throw new Error(`Bad repo name: ${repo}`);
    return { owner, repo: name };
  };

  return {
    async listTree(repo) {
      const { owner, repo: name } = split(repo);
      const { data: info } = await octokit.rest.repos.get({
        owner,
        repo: name,
      });
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo: name,
        tree_sha: info.default_branch,
        recursive: "true",
      });
      return data.tree
        .filter((e) => e.type === "blob" && e.path)
        .map((e) => ({ path: e.path as string, size: e.size ?? 0 }));
    },

    async readText(repo, path) {
      const { owner, repo: name } = split(repo);
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path,
        });
        if (
          Array.isArray(data) ||
          data.type !== "file" ||
          !("content" in data)
        ) {
          return null;
        }
        if (data.size > MAX_FILE_BYTES) return null;
        const text = Buffer.from(data.content, "base64").toString("utf8");
        return text.includes("\0") ? null : text; // binary
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
  };
}
