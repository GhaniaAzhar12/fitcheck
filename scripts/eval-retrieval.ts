// Retrieval eval: keyword vs vector vs hybrid CV search, on a fictional CV
// with hand-labelled proof for each query (evals/retrieval).
//
//   bun run eval:retrieval
//
// Uses the app's Gemini key for embeddings (free tier). Vectors are compared
// in memory with the same fusion code the app uses; no database.
// Results are saved to evals/results/<date>-retrieval-<model>.json.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { cosineSimilarity } from "ai";

import { indexCv, searchChunks } from "@/lib/agent/cv-search";
import {
  fuseRankings,
  MEANING_FLOOR,
  type VectorHit,
} from "@/lib/agent/hybrid-search";
import {
  EMBED_MODEL_ID,
  embedDocuments,
  embedQuery,
} from "@/lib/cv-embeddings";
import {
  loadRetrievalSet,
  relevantPositions,
  scoreRetrieval,
} from "@/lib/evals/retrieval";

const FLOORS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
const TOP = 5;

const { cv, cases } = await loadRetrievalSet();
const chunks = indexCv(cv);
for (const c of cases) relevantPositions(chunks, c); // fail fast on a label typo

console.log(
  `Retrieval eval: ${chunks.length} CV chunks, ${cases.length} queries (${cases.filter((c) => !c.relevant.length).length} with no right answer), ${EMBED_MODEL_ID}\n`,
);

const { vectors } = await embedDocuments(chunks.map((c) => c.text));
const vectorHits: VectorHit[][] = [];
for (const c of cases) {
  const { vector } = await embedQuery(c.query);
  vectorHits.push(
    chunks
      .map((ch, i) => ({
        ...ch,
        similarity: cosineSimilarity(vector, vectors[i]),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10),
  );
}

const positionsOf = (texts: { text: string; section: string | null }[]) =>
  texts.map(
    (m) =>
      chunks.find((c) => c.text === m.text && c.section === m.section)
        ?.position ?? -1,
  );

const keyword = cases.map((c) => ({
  case: c,
  positions: searchChunks(chunks, c.query, TOP).map((m) => m.position),
}));
const vectorOnly = (floor: number) =>
  cases.map((c, i) => ({
    case: c,
    positions: vectorHits[i]
      .filter((h) => h.similarity >= floor)
      .slice(0, TOP)
      .map((h) => h.position),
  }));
const hybrid = (floor: number) =>
  cases.map((c, i) => ({
    case: c,
    positions: positionsOf(
      fuseRankings({
        keyword: searchChunks(chunks, c.query, TOP),
        vector: vectorHits[i],
        minSimilarity: floor,
        limit: TOP,
      }),
    ),
  }));

const pct = (n: number) => `${(n * 100).toFixed(1)}%`.padStart(7);
const rows: Record<string, ReturnType<typeof scoreRetrieval>> = {
  keyword: scoreRetrieval(keyword, chunks),
  "vector (no floor)": scoreRetrieval(vectorOnly(-1), chunks),
};
for (const f of FLOORS)
  rows[`hybrid, floor ${f}`] = scoreRetrieval(hybrid(f), chunks);

console.log(`${"".padEnd(20)} recall@5     MRR  false hits`);
for (const [name, s] of Object.entries(rows)) {
  console.log(
    `${name.padEnd(20)} ${pct(s.recallAt5)} ${pct(s.mrr)} ${pct(s.falseHitRate)}`,
  );
}

// Similarity of the best chunk for no-answer queries vs the right chunk for
// answerable ones: the floor has to sit between them.
const best = (i: number) => vectorHits[i][0]?.similarity ?? 0;
const noAnswer = cases.flatMap((c, i) => (c.relevant.length ? [] : [best(i)]));
const rightAnswer = cases.flatMap((c, i) => {
  if (!c.relevant.length) return [];
  const relevant = relevantPositions(chunks, c);
  return vectorHits[i]
    .filter((h) => relevant.has(h.position))
    .map((h) => h.similarity);
});
console.log(
  `\nTop similarity, no-answer queries: max ${Math.max(...noAnswer).toFixed(3)}`,
);
console.log(
  `Similarity of right chunks: min ${Math.min(...rightAnswer).toFixed(3)}, median ${rightAnswer.sort()[Math.floor(rightAnswer.length / 2)].toFixed(3)}`,
);
console.log(`Current MEANING_FLOOR: ${MEANING_FLOOR}`);

const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
const dir = join(process.cwd(), "evals", "results");
await mkdir(dir, { recursive: true });
const file = join(dir, `${stamp}-retrieval-${EMBED_MODEL_ID}.json`);
await writeFile(
  file,
  `${JSON.stringify(
    {
      model: EMBED_MODEL_ID,
      chunks: chunks.length,
      queries: cases.length,
      floor: MEANING_FLOOR,
      rows,
      perQuery: cases.map((c, i) => ({
        query: c.query,
        keyword: keyword[i].positions,
        vectorTop: vectorHits[i].slice(0, TOP).map((h) => ({
          position: h.position,
          similarity: Number(h.similarity.toFixed(3)),
        })),
        hybrid: hybrid(MEANING_FLOOR)[i].positions,
      })),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nSaved ${file.replace(`${process.cwd()}/`, "")}`);
process.exit(0);
