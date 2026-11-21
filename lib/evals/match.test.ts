import { describe, expect, test } from "bun:test";

import { matchesAny } from "./match";

describe("matchesAny", () => {
  test("matches whole words by default", () => {
    expect(matchesAny("Fluent in Go", ["go"])).toBe(true);
    expect(matchesAny("Google Cloud", ["go"])).toBe(false);
    expect(matchesAny("Strong SQL skills", ["sql"])).toBe(true);
    expect(matchesAny("PostgreSQL", ["sql"])).toBe(false);
  });

  test("a trailing * matches word prefixes", () => {
    expect(matchesAny("PostgreSQL query tuning", ["postgres*"])).toBe(true);
    expect(matchesAny("Writing automated tests", ["test*"])).toBe(true);
    expect(matchesAny("Web accessibility (WCAG)", ["accessib*"])).toBe(true);
  });

  test("handles punctuation inside terms and ignores case", () => {
    expect(matchesAny("Experience with NEXT.JS", ["next.js"])).toBe(true);
    expect(matchesAny("Logistics or e-commerce", ["e-commerce"])).toBe(true);
    expect(matchesAny("Node.js services", ["node"])).toBe(true);
  });
});
