import { describe, expect, test } from "bun:test";

import type { IndexedChunk } from "./cv-search";
import {
  createHybridSearcher,
  fuseRankings,
  keywordSearcher,
  type VectorHit,
} from "./hybrid-search";

const chunk = (position: number, text = `line ${position}`): IndexedChunk => ({
  position,
  section: "EXPERIENCE",
  text,
});
const hit = (c: IndexedChunk, similarity: number): VectorHit => ({
  ...c,
  similarity,
});

const A = chunk(0);
const B = chunk(1);
const C = chunk(2);

describe("fuseRankings", () => {
  test("a chunk found by both lists ranks first and is tagged both", () => {
    const result = fuseRankings({
      keyword: [A, B],
      vector: [hit(C, 0.8), hit(A, 0.7)],
      minSimilarity: 0.6,
    });
    expect(result[0]).toEqual({
      section: A.section,
      text: A.text,
      matchedBy: "both",
    });
    expect(result.map((r) => r.text)).toEqual([A.text, C.text, B.text]);
    expect(result[1].matchedBy).toBe("meaning");
    expect(result[2].matchedBy).toBe("keyword");
  });

  test("meaning-only hits below the floor are dropped", () => {
    expect(
      fuseRankings({ keyword: [], vector: [hit(C, 0.55)], minSimilarity: 0.6 }),
    ).toEqual([]);
  });

  test("keyword hits are kept whatever the similarity", () => {
    expect(
      fuseRankings({
        keyword: [B],
        vector: [hit(B, 0.1)],
        minSimilarity: 0.6,
      }),
    ).toEqual([{ section: B.section, text: B.text, matchedBy: "both" }]);
  });

  test("identical text at two positions stays two entries", () => {
    const first = chunk(3, "Built REST APIs");
    const second = chunk(7, "Built REST APIs");
    const result = fuseRankings({
      keyword: [first, second],
      vector: [],
      minSimilarity: 0.6,
    });
    expect(result).toHaveLength(2);
  });

  test("returns at most limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => chunk(i));
    expect(
      fuseRankings({ keyword: many, vector: [], minSimilarity: 0.6, limit: 5 }),
    ).toHaveLength(5);
  });

  test("scores use 1/(k + rank) with k = 60, ties go to keyword first", () => {
    const result = fuseRankings({
      keyword: [A],
      vector: [hit(B, 0.9)],
      minSimilarity: 0.6,
    });
    expect(result.map((r) => r.text)).toEqual([A.text, B.text]);
  });
});

describe("createHybridSearcher", () => {
  const chunks: IndexedChunk[] = [
    chunk(0, "Integrated Stripe checkout for a gift shop"),
    chunk(1, "Designed REST services for a logistics platform"),
  ];
  const stripeKeyword = [
    {
      section: "EXPERIENCE",
      text: "Integrated Stripe checkout for a gift shop",
      matchedBy: "keyword" as const,
    },
  ];

  test("merges keyword and vector results", async () => {
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => [1, 0],
      vectorSearch: async () => [hit(chunks[1], 0.8)],
      minSimilarity: 0.6,
    });
    const result = await search("API design");
    expect(result).toEqual([
      { section: "EXPERIENCE", text: chunks[1].text, matchedBy: "meaning" },
    ]);
  });

  test("falls back to keyword results when embedding throws", async () => {
    const errors: unknown[] = [];
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => {
        throw new Error("429");
      },
      vectorSearch: async () => [],
      minSimilarity: 0.6,
      onError: (e) => errors.push(e),
    });
    expect(await search("Stripe")).toEqual(stripeKeyword);
    expect(errors).toHaveLength(1);
  });

  test("after one failure it stops trying meaning search for the run", async () => {
    let calls = 0;
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => {
        calls++;
        throw new Error("timeout");
      },
      vectorSearch: async () => [],
      minSimilarity: 0.6,
      onError: () => {},
    });
    await search("Stripe");
    expect(await search("Stripe")).toEqual(stripeKeyword);
    expect(calls).toBe(1);
  });

  test("falls back when the vector search throws", async () => {
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => [1, 0],
      vectorSearch: async () => {
        throw new Error("db down");
      },
      minSimilarity: 0.6,
      onError: () => {},
    });
    expect(await search("Stripe")).toEqual(stripeKeyword);
  });

  test("an empty CV returns no matches without calling embedQuery", async () => {
    let calls = 0;
    const search = createHybridSearcher({
      chunks: [],
      embedQuery: async () => {
        calls++;
        return [1];
      },
      vectorSearch: async () => [],
      minSimilarity: 0.6,
    });
    expect(await search("Stripe")).toEqual([]);
    expect(calls).toBe(0);
  });

  test("a query about nothing in the CV returns no matches", async () => {
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => [1, 0],
      vectorSearch: async () => [hit(chunks[1], 0.4), hit(chunks[0], 0.3)],
      minSimilarity: 0.6,
    });
    expect(await search("Kubernetes")).toEqual([]);
  });

  test("counts the queries it embedded", async () => {
    const search = createHybridSearcher({
      chunks,
      embedQuery: async () => [1, 0],
      vectorSearch: async () => [],
      minSimilarity: 0.6,
    });
    await search("Stripe");
    await search("REST");
    expect(search.queries()).toBe(2);
  });
});

describe("keywordSearcher", () => {
  test("tags every match as keyword", async () => {
    const result = await keywordSearcher(
      "EXPERIENCE\n• Integrated Stripe checkout",
    )("Stripe");
    expect(result).toEqual([
      {
        section: "EXPERIENCE",
        text: "Integrated Stripe checkout",
        matchedBy: "keyword",
      },
    ]);
  });
});
