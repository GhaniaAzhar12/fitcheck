import { describe, expect, test } from "bun:test";

import type { IndexedChunk } from "@/lib/agent/cv-search";

import { relevantPositions, scoreRetrieval } from "./retrieval";

const chunks: IndexedChunk[] = [
  "Designed REST services for a logistics platform",
  "Mentored two junior developers",
  "Moved card payments to a hosted checkout page",
  "Wrote Playwright tests for checkout",
].map((text, position) => ({ position, section: "EXPERIENCE", text }));

describe("relevantPositions", () => {
  test("finds chunks by a distinctive substring, ignoring case", () => {
    expect(
      relevantPositions(chunks, {
        query: "API design",
        relevant: ["rest services", "Playwright"],
      }),
    ).toEqual(new Set([0, 3]));
  });

  test("throws when a label matches no chunk", () => {
    expect(() =>
      relevantPositions(chunks, { query: "x", relevant: ["GraphQL"] }),
    ).toThrow('"GraphQL"');
  });
});

describe("scoreRetrieval", () => {
  const api = { query: "API design", relevant: ["REST services"] };
  const lead = { query: "Leading a team", relevant: ["Mentored", "hosted"] };
  const none = { query: "Kubernetes", relevant: [] };

  test("recall@5 is the share of relevant chunks in the top 5, averaged", () => {
    const s = scoreRetrieval(
      [
        { case: api, positions: [0] }, // 1/1
        { case: lead, positions: [1, 3] }, // 1/2
      ],
      chunks,
    );
    expect(s.recallAt5).toBeCloseTo(0.75);
  });

  test("MRR is 1/rank of the first relevant hit, 0 when missing", () => {
    const s = scoreRetrieval(
      [
        { case: api, positions: [3, 0] }, // 1/2
        { case: lead, positions: [3] }, // 0
      ],
      chunks,
    );
    expect(s.mrr).toBeCloseTo(0.25);
  });

  test("false-hit rate counts no-answer queries that return anything", () => {
    const s = scoreRetrieval(
      [
        { case: none, positions: [2] },
        { case: { query: "Rust", relevant: [] }, positions: [] },
        { case: api, positions: [0] },
      ],
      chunks,
    );
    expect(s.falseHitRate).toBeCloseTo(0.5);
    expect(s.recallAt5).toBeCloseTo(1);
  });

  test("only the top 5 positions count", () => {
    const s = scoreRetrieval(
      [{ case: api, positions: [1, 2, 3, 1, 2, 0] }],
      chunks,
    );
    expect(s.recallAt5).toBe(0);
  });
});
