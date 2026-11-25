import { describe, expect, test } from "bun:test";

import {
  chunkCv,
  indexCv,
  searchChunks,
  searchCv,
  tokenize,
} from "./cv-search";

const CV = `JANE DOE
Software Engineer · Lahore

EXPERIENCE
Senior Engineer, Acme (2023 – now)
• Led a 6-person team building a logistics platform in Next.js and TypeScript
• Integrated Stripe checkout, raising conversion by 15%
- Cut page load times by 30% with caching and code splitting

Engineer, Beta Ltd (2021 – 2023)
Built REST APIs in Node.js with a Postgres database.

SKILLS
React, Next.js, TypeScript, Tailwind, Supabase, PostgreSQL, Prisma, Jest, Playwright`;

describe("chunkCv", () => {
  test("splits bullets into their own chunks under the right section", () => {
    const chunks = chunkCv(CV);
    const stripe = chunks.find((c) => c.text.includes("Stripe"));
    expect(stripe).toEqual({
      section: "EXPERIENCE",
      text: "Integrated Stripe checkout, raising conversion by 15%",
    });
    expect(chunks.find((c) => c.text.startsWith("React"))?.section).toBe(
      "SKILLS",
    );
  });

  test("treats a short all-caps line as a heading, not content", () => {
    expect(chunkCv(CV).some((c) => c.text === "EXPERIENCE")).toBe(false);
  });

  test("keeps tech acronyms and comma lists as content, not headings", () => {
    const chunks = chunkCv("SKILLS\nReact, Tailwind\nCSS\nAWS, GCP");
    expect(chunks.every((c) => c.section === "SKILLS")).toBe(true);
    expect(chunks.map((c) => c.text).join(" ")).toContain("CSS");
  });

  test("splits a long bullet-less block (typical PDF text) into sentences", () => {
    const block = [
      "EXPERIENCE",
      "Software Engineer at Acme, Lahore. Led a 6-person team building a logistics platform used by",
      "200 carriers. Integrated Stripe checkout for a gifting site, raising conversion by 15%. Cut page",
      "load times by 30% with caching, code splitting and image optimisation across the whole app.",
    ].join("\n");
    const chunks = chunkCv(block);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.section === "EXPERIENCE")).toBe(true);
    expect(searchCv(block, "Stripe")[0]?.text).toBe(
      "Integrated Stripe checkout for a gifting site, raising conversion by 15%.",
    );
  });

  test("splits at bullets inside a line", () => {
    const line = `PROJECTS\n${"Built a marketplace with Next.js and Prisma for UK buyers and sellers. ".repeat(3)}• Added Stripe Connect payouts for sellers in two currencies • Wrote Playwright tests for checkout`;
    const texts = chunkCv(line).map((c) => c.text);
    expect(texts).toContain(
      "Added Stripe Connect payouts for sellers in two currencies",
    );
    expect(texts).toContain("Wrote Playwright tests for checkout");
  });
});

describe("tokenize", () => {
  test("maps different spellings to one token", () => {
    expect(tokenize("Postgres")).toEqual(["postgresql"]);
    expect(tokenize("NextJS and TS")).toEqual(["next.js", "typescript"]);
    expect(tokenize("Node")).toEqual(["node.js"]);
  });

  test("drops filler words", () => {
    expect(tokenize("strong experience with the React")).toEqual(["react"]);
  });
});

describe("searchCv", () => {
  test("finds the Stripe bullet first", () => {
    const [top] = searchCv(CV, "Stripe payments");
    expect(top?.text).toContain("Stripe checkout");
    expect(top?.section).toBe("EXPERIENCE");
  });

  test("matches PostgreSQL when the CV says Postgres, and the other way round", () => {
    const texts = searchCv(CV, "PostgreSQL").map((m) => m.text);
    expect(texts.some((t) => t.includes("Postgres database"))).toBe(true);
    expect(texts.some((t) => t.includes("PostgreSQL, Prisma"))).toBe(true);
  });

  test("scores a whole-phrase match above a partial one", () => {
    const [top] = searchCv(CV, "code splitting");
    expect(top?.text).toContain("code splitting");
  });

  test("returns nothing for unrelated or empty queries", () => {
    expect(searchCv(CV, "Kubernetes")).toEqual([]);
    expect(searchCv(CV, "   ")).toEqual([]);
    expect(searchCv(CV, "the with and")).toEqual([]);
  });

  test("respects the limit", () => {
    expect(searchCv(CV, "React Next.js TypeScript", 2)).toHaveLength(2);
  });
});

describe("indexCv and searchChunks", () => {
  test("numbers chunks 0..n-1 in CV order", () => {
    const indexed = indexCv(CV);
    expect(indexed.map((c) => c.position)).toEqual(
      chunkCv(CV).map((_, i) => i),
    );
    expect(indexed.map(({ section, text }) => ({ section, text }))).toEqual(
      chunkCv(CV),
    );
  });

  test("finds the same chunks as searchCv, with their positions", () => {
    const chunks = indexCv(CV);
    for (const query of ["Stripe", "Postgres", "Next.js TypeScript"]) {
      const found = searchChunks(chunks, query);
      expect(
        found.map(({ section, text, score }) => ({ section, text, score })),
      ).toEqual(searchCv(CV, query));
      for (const m of found) expect(chunks[m.position].text).toBe(m.text);
    }
  });
});
