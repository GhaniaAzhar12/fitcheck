import { describe, expect, test } from "bun:test";

import {
  isSourceFile,
  MAX_FILES,
  normalizePath,
  numberLines,
  pickSourceFiles,
} from "./repo-files";

const file = (path: string, size = 1_000) => ({ path, size });

describe("isSourceFile", () => {
  test("keeps code and config files", () => {
    for (const p of [
      "app/page.tsx",
      "lib/db.ts",
      "prisma/schema.prisma",
      "README.md",
      "Dockerfile",
      "api/main.py",
    ]) {
      expect(isSourceFile(file(p))).toBe(true);
    }
  });

  test("skips dependencies, build output, lock files, media and huge files", () => {
    for (const p of [
      "node_modules/react/index.js",
      ".next/server/page.js",
      "dist/bundle.js",
      "lib/generated/prisma/client.ts",
      "bun.lock",
      "package-lock.json",
      "public/logo.png",
      "assets/app.min.js",
    ]) {
      expect(isSourceFile(file(p))).toBe(false);
    }
    expect(isSourceFile(file("data/big.json", 500_000))).toBe(false);
  });
});

describe("pickSourceFiles", () => {
  test("lists README and package.json first, then shallow paths", () => {
    const { files } = pickSourceFiles([
      file("app/jobs/[id]/page.tsx"),
      file("package.json"),
      file("lib/db.ts"),
      file("README.md"),
      file("node_modules/x/index.js"),
    ]);
    expect(files).toEqual([
      "README.md",
      "package.json",
      "lib/db.ts",
      "app/jobs/[id]/page.tsx",
    ]);
  });

  test(`caps the list at ${MAX_FILES} and reports the real total`, () => {
    const tree = Array.from({ length: 250 }, (_, i) => file(`src/f${i}.ts`));
    const result = pickSourceFiles(tree);
    expect(result.files).toHaveLength(MAX_FILES);
    expect(result.total).toBe(250);
    expect(result.truncated).toBe(true);
  });
});

describe("normalizePath", () => {
  test("cleans harmless prefixes", () => {
    expect(normalizePath("./lib/db.ts")).toBe("lib/db.ts");
    expect(normalizePath("/lib/db.ts")).toBe("lib/db.ts");
  });

  test("rejects paths that try to escape the repo", () => {
    expect(normalizePath("../secrets.env")).toBeNull();
    expect(normalizePath("lib/../../x")).toBeNull();
    expect(normalizePath("lib\\db.ts")).toBeNull();
    expect(normalizePath("   ")).toBeNull();
  });
});

describe("numberLines", () => {
  test("numbers lines and cuts at the limit", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const result = numberLines(text, 3);
    expect(result.content.split("\n")).toEqual([
      "   1| line 1",
      "   2| line 2",
      "   3| line 3",
    ]);
    expect(result.totalLines).toBe(10);
    expect(result.truncated).toBe(true);
  });

  test("shortens very long lines", () => {
    const { content } = numberLines("x".repeat(1_000));
    expect(content.length).toBeLessThan(320);
    expect(content.endsWith("…")).toBe(true);
  });
});
