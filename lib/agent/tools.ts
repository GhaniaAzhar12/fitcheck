import { tool } from "ai";
import { z } from "zod";

import { searchCv } from "./cv-search";
import {
  MAX_LINES,
  normalizePath,
  numberLines,
  pickSourceFiles,
  type RepoApi,
} from "./repo-files";

export type EvidenceToolsOptions = {
  cvText: string;
  /** The user's chosen evidence repos, "owner/name". Nothing else is readable. */
  repos: string[];
  github: RepoApi;
};

/**
 * The agent's three tools. Each returns plain data, or { error } so the
 * model can recover instead of the run failing.
 */
export function createEvidenceTools({
  cvText,
  repos,
  github,
}: EvidenceToolsOptions) {
  // One file listing per repo per run.
  const fileLists = new Map<
    string,
    Promise<ReturnType<typeof pickSourceFiles>>
  >();

  /** Accepts "owner/name" or just "name"; only the user's chosen repos. */
  function resolveRepo(input: string): string | null {
    const wanted = input.trim().toLowerCase();
    return (
      repos.find(
        (r) =>
          r.toLowerCase() === wanted ||
          r.split("/")[1]?.toLowerCase() === wanted,
      ) ?? null
    );
  }

  function sourceFiles(repo: string) {
    let list = fileLists.get(repo);
    if (!list) {
      list = github.listTree(repo).then(pickSourceFiles);
      fileLists.set(repo, list);
      list.catch(() => fileLists.delete(repo)); // allow a retry after an error
    }
    return list;
  }

  const notAllowed = (repo: string) => ({
    error: `"${repo}" isn't one of the user's evidence repos. Use one of: ${repos.join(", ")}`,
  });

  return {
    search_cv: tool({
      description:
        "Search the user's CV for lines about a skill, technology or experience. Returns the best-matching bullets with their CV section.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "A skill or requirement, e.g. 'Stripe payments' or 'PostgreSQL'",
          ),
      }),
      execute: async ({ query }) => {
        const matches = searchCv(cvText, query);
        return matches.length
          ? { matches }
          : { matches: [], note: `Nothing in the CV mentions "${query}".` };
      },
    }),

    list_repo_files: tool({
      description: `List source files in one of the user's evidence repos (up to 200, overview files first). Repos: ${repos.join(", ")}`,
      inputSchema: z.object({
        repo: z
          .string()
          .min(1)
          .max(200)
          .describe("Repo as 'owner/name' or 'name'"),
      }),
      execute: async ({ repo }) => {
        const resolved = resolveRepo(repo);
        if (!resolved) return notAllowed(repo);
        try {
          return { repo: resolved, ...(await sourceFiles(resolved)) };
        } catch {
          return {
            error: `Couldn't list files in ${resolved}. Try another repo.`,
          };
        }
      },
    }),

    read_file: tool({
      description: `Read a file from one of the user's evidence repos. Returns the first ${MAX_LINES} lines, numbered. Use paths from list_repo_files.`,
      inputSchema: z.object({
        repo: z
          .string()
          .min(1)
          .max(200)
          .describe("Repo as 'owner/name' or 'name'"),
        path: z
          .string()
          .min(1)
          .max(500)
          .describe("File path from list_repo_files"),
      }),
      execute: async ({ repo, path }) => {
        const resolved = resolveRepo(repo);
        if (!resolved) return notAllowed(repo);
        const clean = normalizePath(path);
        if (!clean) return { error: `"${path}" isn't a valid file path.` };

        try {
          const { files } = await sourceFiles(resolved);
          if (!files.includes(clean)) {
            return {
              error: `${clean} isn't in ${resolved}'s source files. Call list_repo_files first.`,
            };
          }
          const text = await github.readText(resolved, clean);
          if (text === null) {
            return { error: `${clean} can't be read (binary or too large).` };
          }
          return { repo: resolved, path: clean, ...numberLines(text) };
        } catch {
          return { error: `Couldn't read ${clean} from ${resolved}.` };
        }
      },
    }),
  };
}

export type EvidenceTools = ReturnType<typeof createEvidenceTools>;
