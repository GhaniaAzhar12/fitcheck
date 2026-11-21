import { describe, expect, test } from "bun:test";

import {
  buildBookmarklet,
  MAX_IMPORT_CHARS,
  parseImportHash,
} from "./bookmarklet";

const text =
  "Senior React Developer at Acme. You'll build accessible UIs in React and TypeScript.";
const hashFor = (payload: unknown) =>
  `#${encodeURIComponent(JSON.stringify(payload))}`;

describe("buildBookmarklet", () => {
  test("is a javascript: URL that opens this Fitcheck's import page", () => {
    const code = buildBookmarklet("https://fitcheck-psi-three.vercel.app");
    expect(code.startsWith("javascript:")).toBe(true);
    const source = decodeURIComponent(code.slice("javascript:".length));
    expect(source).toContain(
      '"https://fitcheck-psi-three.vercel.app/jobs/import"',
    );
    expect(source).toContain("#jobDescriptionText"); // knows where Indeed puts the job
    expect(source).not.toContain("\n"); // one line, so it saves as a bookmark
  });

  test("runs as valid JavaScript", () => {
    const source = decodeURIComponent(
      buildBookmarklet("http://localhost:3005").slice(11),
    );
    expect(() => new Function(source)).not.toThrow();
  });
});

describe("parseImportHash", () => {
  test("reads a job sent by the bookmarklet", () => {
    const job = {
      v: 1 as const,
      url: "https://www.linkedin.com/jobs/view/123",
      title: "Senior React Developer | Acme",
      text,
    };
    expect(parseImportHash(hashFor(job))).toEqual(job);
  });

  test("ignores anything malformed or unexpected", () => {
    expect(parseImportHash("")).toBeNull();
    expect(parseImportHash("#")).toBeNull();
    expect(parseImportHash("#not-json")).toBeNull();
    expect(parseImportHash("#%E0%A4%A")).toBeNull(); // broken encoding
    expect(
      parseImportHash(hashFor({ v: 2, url: "https://x.com", title: "", text })),
    ).toBeNull();
    expect(
      parseImportHash(
        hashFor({ v: 1, url: "javascript:alert(1)", title: "", text }),
      ),
    ).toBeNull();
    expect(
      parseImportHash(
        hashFor({ v: 1, url: "https://x.com", title: "", text: "too short" }),
      ),
    ).toBeNull();
    expect(
      parseImportHash(
        hashFor({
          v: 1,
          url: "https://x.com",
          title: "",
          text: "x".repeat(MAX_IMPORT_CHARS + 1),
        }),
      ),
    ).toBeNull();
  });
});
