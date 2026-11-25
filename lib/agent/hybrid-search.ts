// Hybrid CV search: merges keyword and meaning-based (vector) rankings.
// Pure functions with no I/O; the database and embedding calls are passed in.

import { type IndexedChunk, indexCv, searchChunks } from "./cv-search";

export type MatchedBy = "keyword" | "meaning" | "both";
export type HybridMatch = {
  section: string | null;
  text: string;
  matchedBy: MatchedBy;
};
export type VectorHit = IndexedChunk & { similarity: number };

/**
 * Minimum cosine similarity for a chunk found only by meaning. Set from the
 * retrieval eval (evals/retrieval).
 */
export const MEANING_FLOOR = 0.65;

/** Reciprocal rank fusion constant: dampens the gap between rank 1 and 2. */
export const RRF_K = 60;

/**
 * Merges the two rankings with reciprocal rank fusion. A chunk found only by
 * meaning must reach minSimilarity: vector search always returns something,
 * and weak matches would tempt the judge into overclaiming.
 */
export function fuseRankings({
  keyword,
  vector,
  minSimilarity,
  limit = 5,
}: {
  keyword: IndexedChunk[];
  vector: VectorHit[];
  minSimilarity: number;
  limit?: number;
}): HybridMatch[] {
  const byPosition = new Map<
    number,
    {
      chunk: IndexedChunk;
      score: number;
      keywordRank: number;
      inKeyword: boolean;
      inVector: boolean;
    }
  >();

  keyword.forEach((chunk, i) => {
    byPosition.set(chunk.position, {
      chunk,
      score: 1 / (RRF_K + i + 1),
      keywordRank: i + 1,
      inKeyword: true,
      inVector: false,
    });
  });

  const keptVector = vector.filter(
    (h) => h.similarity >= minSimilarity || byPosition.has(h.position),
  );
  keptVector.forEach((h, i) => {
    const score = 1 / (RRF_K + i + 1);
    const seen = byPosition.get(h.position);
    if (seen) {
      seen.score += score;
      seen.inVector = true;
    } else {
      byPosition.set(h.position, {
        chunk: h,
        score,
        keywordRank: Number.POSITIVE_INFINITY,
        inKeyword: false,
        inVector: true,
      });
    }
  });

  return [...byPosition.values()]
    .sort((a, b) => b.score - a.score || a.keywordRank - b.keywordRank)
    .slice(0, limit)
    .map(({ chunk, inKeyword, inVector }) => ({
      section: chunk.section,
      text: chunk.text,
      matchedBy:
        inKeyword && inVector ? "both" : inKeyword ? "keyword" : "meaning",
    }));
}

/** What the search_cv tool calls: a query in, the best CV lines out. */
export type CvSearcher = (query: string) => Promise<HybridMatch[]>;

/** Today's keyword-only search, with every match tagged "keyword". */
export function keywordSearcher(cvText: string): CvSearcher {
  const chunks = indexCv(cvText);
  return async (query) =>
    searchChunks(chunks, query).map(({ section, text }) => ({
      section,
      text,
      matchedBy: "keyword" as const,
    }));
}

/**
 * Keyword + meaning search over one CV's chunks. If embedding or the vector
 * search fails, it quietly falls back to keyword results, and stays on
 * keywords for the rest of the run so a failing API can't slow every search.
 */
export function createHybridSearcher(deps: {
  chunks: IndexedChunk[];
  embedQuery: (query: string) => Promise<number[]>;
  vectorSearch: (vector: number[]) => Promise<VectorHit[]>;
  minSimilarity: number;
  onError?: (error: unknown) => void;
}): CvSearcher & { queries: () => number } {
  let embedded = 0;
  let failed = false;
  const search = async (query: string): Promise<HybridMatch[]> => {
    if (!deps.chunks.length) return [];
    const keyword = searchChunks(deps.chunks, query);
    let vector: VectorHit[] = [];
    if (!failed)
      try {
        const queryVector = await deps.embedQuery(query);
        embedded++;
        vector = await deps.vectorSearch(queryVector);
      } catch (error) {
        failed = true;
        deps.onError?.(error);
      }
    return fuseRankings({
      keyword,
      vector,
      minSimilarity: deps.minSimilarity,
    });
  };
  return Object.assign(search, { queries: () => embedded });
}
