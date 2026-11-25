import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { IndexedChunk } from "@/lib/agent/cv-search";

// Retrieval eval: does CV search put the real proof in its top 5?
// Labels are distinctive substrings of CV lines, so they survive small
// chunking changes (evals/retrieval/queries.json).

const RetrievalCase = z.object({
  query: z.string().min(2),
  /** Substrings of the CV lines that really prove it; [] = no right answer. */
  relevant: z.array(z.string().min(3)),
});
export type RetrievalCase = z.infer<typeof RetrievalCase>;

export const RETRIEVAL_DIR = join(process.cwd(), "evals", "retrieval");

export async function loadRetrievalSet(dir = RETRIEVAL_DIR) {
  const cv = await readFile(join(dir, "cv.md"), "utf8");
  const cases = z
    .array(RetrievalCase)
    .min(1)
    .parse(JSON.parse(await readFile(join(dir, "queries.json"), "utf8")));
  return { cv, cases };
}

/** Positions of the chunks a case's labels point at. Throws on a typo. */
export function relevantPositions(
  chunks: IndexedChunk[],
  c: RetrievalCase,
): Set<number> {
  const found = new Set<number>();
  for (const label of c.relevant) {
    const needle = label.toLowerCase();
    const hits = chunks.filter((ch) => ch.text.toLowerCase().includes(needle));
    if (!hits.length) {
      throw new Error(`"${label}" (query "${c.query}") matches no CV chunk`);
    }
    for (const h of hits) found.add(h.position);
  }
  return found;
}

const TOP = 5;

export function scoreRetrieval(
  results: { case: RetrievalCase; positions: number[] }[],
  chunks: IndexedChunk[],
): { recallAt5: number; mrr: number; falseHitRate: number } {
  const answerable = results.filter((r) => r.case.relevant.length);
  const unanswerable = results.filter((r) => !r.case.relevant.length);

  let recall = 0;
  let reciprocal = 0;
  for (const r of answerable) {
    const relevant = relevantPositions(chunks, r.case);
    const top = r.positions.slice(0, TOP);
    recall += top.filter((p) => relevant.has(p)).length / relevant.size;
    const rank = top.findIndex((p) => relevant.has(p));
    reciprocal += rank === -1 ? 0 : 1 / (rank + 1);
  }

  const mean = (sum: number, n: number) => (n ? sum / n : 0);
  return {
    recallAt5: mean(recall, answerable.length),
    mrr: mean(reciprocal, answerable.length),
    falseHitRate: mean(
      unanswerable.filter((r) => r.positions.length).length,
      unanswerable.length,
    ),
  };
}
