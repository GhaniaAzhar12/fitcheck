import { describe, expect, test } from "bun:test";

import type { RepoApi, TreeEntry } from "./repo-files";
import { createEvidenceTools } from "./tools";

/** A fake GitHub with one repo, counting calls. */
function fakeGitHub(files: Record<string, string>) {
  const calls = { listTree: 0, readText: 0 };
  const api: RepoApi = {
    async listTree(repo) {
      calls.listTree++;
      if (repo !== "jane/shop") throw new Error("not found");
      return Object.entries(files).map(
        ([path, text]): TreeEntry => ({ path, size: text.length }),
      );
    },
    async readText(_repo, path) {
      calls.readText++;
      return files[path] ?? null;
    },
  };
  return { api, calls };
}

const FILES = {
  "README.md": "# Shop\nA store with Stripe checkout.",
  "app/api/checkout/route.ts": Array.from({ length: 400 }, (_, i) =>
    i === 0 ? 'import Stripe from "stripe";' : `// line ${i + 1}`,
  ).join("\n"),
  "node_modules/stripe/index.js": "module.exports = {}",
};

function setup() {
  const github = fakeGitHub(FILES);
  const tools = createEvidenceTools({
    cvText: "EXPERIENCE\n• Integrated Stripe checkout for a gift shop",
    repos: ["jane/shop"],
    github: github.api,
  });
  return { tools, calls: github.calls };
}

type Execute = (input: unknown, options: unknown) => unknown;

// Tools are called directly here, the way the agent will call them.
async function run(t: { execute?: unknown }, input: unknown) {
  if (typeof t.execute !== "function") throw new Error("tool has no execute");
  return (t.execute as Execute)(input, { toolCallId: "test", messages: [] });
}

describe("search_cv", () => {
  test("returns matching CV lines", async () => {
    const { tools } = setup();
    const result = (await run(tools.search_cv, { query: "Stripe" })) as {
      matches: { text: string }[];
    };
    expect(result.matches[0]?.text).toContain("Stripe checkout");
  });

  test("says so when nothing matches", async () => {
    const { tools } = setup();
    expect(await run(tools.search_cv, { query: "Kubernetes" })).toEqual({
      matches: [],
      note: 'Nothing in the CV mentions "Kubernetes".',
    });
  });
});

describe("list_repo_files", () => {
  test("lists source files only, accepting the short repo name", async () => {
    const { tools } = setup();
    const result = (await run(tools.list_repo_files, { repo: "shop" })) as {
      repo: string;
      files: string[];
    };
    expect(result.repo).toBe("jane/shop");
    expect(result.files).toEqual(["README.md", "app/api/checkout/route.ts"]);
  });

  test("refuses repos the user didn't choose", async () => {
    const { tools, calls } = setup();
    const result = (await run(tools.list_repo_files, {
      repo: "someone/else",
    })) as {
      error: string;
    };
    expect(result.error).toContain("isn't one of the user's evidence repos");
    expect(calls.listTree).toBe(0);
  });
});

describe("read_file", () => {
  test("returns the first 300 numbered lines", async () => {
    const { tools } = setup();
    const result = (await run(tools.read_file, {
      repo: "jane/shop",
      path: "app/api/checkout/route.ts",
    })) as { content: string; totalLines: number; truncated: boolean };
    expect(result.content.split("\n")).toHaveLength(300);
    expect(
      result.content.startsWith('   1| import Stripe from "stripe";'),
    ).toBe(true);
    expect(result.totalLines).toBe(400);
    expect(result.truncated).toBe(true);
  });

  test("lists the repo only once per run", async () => {
    const { tools, calls } = setup();
    await run(tools.list_repo_files, { repo: "shop" });
    await run(tools.read_file, { repo: "shop", path: "README.md" });
    await run(tools.read_file, {
      repo: "shop",
      path: "app/api/checkout/route.ts",
    });
    expect(calls.listTree).toBe(1);
  });

  test("refuses files outside the source list and path tricks", async () => {
    const { tools, calls } = setup();
    for (const path of [
      "node_modules/stripe/index.js",
      "../.env",
      "missing.ts",
    ]) {
      const result = (await run(tools.read_file, { repo: "shop", path })) as {
        error?: string;
      };
      expect(result.error).toBeDefined();
    }
    expect(calls.readText).toBe(0);
  });

  test("refuses repos the user didn't choose", async () => {
    const { tools } = setup();
    const result = (await run(tools.read_file, {
      repo: "torvalds/linux",
      path: "README",
    })) as { error: string };
    expect(result.error).toContain("isn't one of the user's evidence repos");
  });
});
