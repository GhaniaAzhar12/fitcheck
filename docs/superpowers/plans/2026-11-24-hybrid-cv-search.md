# Hybrid CV Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `search_cv` merges keyword and meaning-based (pgvector) results for free-tier analyses, measured by a new retrieval eval, without adding overclaims.

**Architecture:** Pure ranking logic (keyword scoring by chunk position, reciprocal rank fusion, similarity floor, `matchedBy` tags) lives in a no-I/O module with injected dependencies. A server-only module owns the `cv_chunk` table: saving chunks on upload, embedding them at analysis time, and the pgvector query. `run-analysis.ts` builds the hybrid searcher only when the run uses the app's own Gemini key; everything else keeps today's keyword search.

**Tech Stack:** Next.js 16, Bun test, Prisma 7 (`Unsupported("vector(768)")` + raw SQL), Neon Postgres with pgvector, Vercel AI SDK 7 `embed`/`embedMany`, `@ai-sdk/google` `gemini-embedding-001`.

**Spec:** `docs/superpowers/specs/2026-11-24-hybrid-cv-search-design.md`

## Global Constraints

- **Commits are Ghania's.** Never run `git commit` or `git push`. Each task ends with a checkpoint listing the files for her to commit in GitHub Desktop.
- Never print `.env` values or the real CV text; check secrets by length or prefix only.
- Embedding model: `gemini-embedding-001`, `dimensions: 768`, `taskType` `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for queries, on the app's key (`GOOGLE_GENERATIVE_AI_API_KEY`). Stored model label: `"google:gemini-embedding-001"`.
- Meaning-based search runs only when `aiChoice` is undefined **and** the server's default provider is `google` **and** the key is set. Own-key and Local runs: keyword only, CV never embedded.
- Reciprocal rank fusion with `k = 60`; vector list `LIMIT 10`; return top 5.
- No HNSW/IVFFlat index; an exact scan filtered by `userId`.
- An embedding failure never fails an upload or an analysis.
- Commands: `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build`, `bun run e2e`.
- The database in `.env` is shared with the live site. Migrations here are additive only (extension, table, enum value). The live site needs `bun run db:deploy` before the new code deploys.
- No em dashes in user-facing copy or the README (house style).

## Review Focus

1. **Embedding API fails mid-analysis** (429 or network): the run finishes on keyword search; nothing surfaces to the user. Covered in Task 2 (`createHybridSearcher` fallback test) and Task 5.
2. **A requirement the CV has nothing about** ("Kubernetes"): meaning-only hits under the floor are dropped, so the tool returns no matches and the "Nothing in the CV mentions" note. Covered in Task 1 and Task 2.
3. **CV re-uploaded after it was embedded:** old chunks and vectors are replaced, never mixed with the new CV. Covered in Task 4's check script.
4. **Two identical bullets in one CV:** chunks are keyed by `position`, not text, so both survive fusion as separate entries. Covered in Task 1.
5. **Existing user with a CV but no `cv_chunk` rows** (uploaded before this feature): the first free-tier analysis creates and embeds the chunks. Covered in Task 4's check script.

---

### Task 1: Pure hybrid ranking

**Files:**
- Modify: `lib/agent/cv-search.ts`
- Create: `lib/agent/hybrid-search.ts`
- Test: `lib/agent/cv-search.test.ts`, `lib/agent/hybrid-search.test.ts`

**Interfaces:**
- Produces (in `cv-search.ts`):
  - `type IndexedChunk = CvChunk & { position: number }`
  - `indexCv(cvText: string): IndexedChunk[]` (`chunkCv` plus position = array index)
  - `searchChunks(chunks: IndexedChunk[], query: string, limit = 5): (IndexedChunk & { score: number })[]` (today's scoring logic; `searchCv` becomes `searchChunks(indexCv(cvText), query, limit)` and keeps its return shape)
- Produces (in `hybrid-search.ts`):
  - `type MatchedBy = "keyword" | "meaning" | "both"`
  - `type HybridMatch = { section: string | null; text: string; matchedBy: MatchedBy }`
  - `type VectorHit = IndexedChunk & { similarity: number }`
  - `const RRF_K = 60`
  - `fuseRankings(opts: { keyword: IndexedChunk[]; vector: VectorHit[]; minSimilarity: number; limit?: number }): HybridMatch[]`

- [ ] **Step 1: Write the failing tests**

In `cv-search.test.ts`: `indexCv` gives positions 0..n-1 in chunk order; `searchChunks` returns the same chunks as `searchCv` for the existing test cases, each with its `position`.

In `hybrid-search.test.ts`:
- `"a chunk found by both lists ranks first and is tagged both"`: keyword `[A, B]`, vector `[{...C, similarity: .8}, {...A, similarity: .7}]`, floor `.6` → first is A with `matchedBy: "both"`.
- `"meaning-only hits below the floor are dropped"`: keyword `[]`, vector `[{...C, similarity: .55}]`, floor `.6` → `[]`.
- `"keyword hits are kept whatever the similarity"`: keyword `[B]`, vector `[{...B, similarity: .1}]`, floor `.6` → `[{ ...B, matchedBy: "both" }]`.
- `"identical text at two positions stays two entries"`: two chunks, same text, positions 3 and 7 → both returned.
- `"returns at most limit"`: 8 keyword chunks, `limit: 5` → length 5.
- `"scores use 1/(k + rank) with k = 60"`: keyword `[A]` (rank 1), vector `[B@.9]` (rank 1) and `[A]` absent from vector → A and B tie; tie broken by keyword first (so A before B).

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test lib/agent`
Expected: FAIL, `indexCv` / `fuseRankings` not exported.

- [ ] **Step 3: Implement**

`fuseRankings`: drop vector hits with `similarity < minSimilarity` unless the same `position` is in the keyword list; score = Σ `1 / (RRF_K + rank)` over the lists a position appears in (rank starts at 1); sort by score desc, ties by keyword rank first; tag by which lists contained the position.

- [ ] **Step 4: Run the tests and see them pass**

Run: `bun run test lib/agent`
Expected: PASS, including the existing `cv-search` and `tools` tests.

- [ ] **Step 5: Checkpoint.** List for Ghania: `lib/agent/cv-search.ts`, `lib/agent/cv-search.test.ts`, `lib/agent/hybrid-search.ts`, `lib/agent/hybrid-search.test.ts`. Message: `feat(search): reciprocal rank fusion for CV search`.

### Task 2: A searcher the agent can be given

**Files:**
- Modify: `lib/agent/hybrid-search.ts`, `lib/agent/tools.ts`, `lib/agent/find-evidence.ts`
- Test: `lib/agent/hybrid-search.test.ts`, `lib/agent/tools.test.ts`

**Interfaces:**
- Consumes: Task 1's `IndexedChunk`, `searchChunks`, `fuseRankings`, `VectorHit`, `HybridMatch`.
- Produces:
  - `type CvSearcher = (query: string) => Promise<HybridMatch[]>`
  - `keywordSearcher(cvText: string): CvSearcher` (every match tagged `"keyword"`)
  - `createHybridSearcher(deps: { chunks: IndexedChunk[]; embedQuery: (q: string) => Promise<number[]>; vectorSearch: (v: number[]) => Promise<VectorHit[]>; minSimilarity: number; onError?: (e: unknown) => void }): CvSearcher & { queries: () => number }`
  - `createEvidenceTools({ cvText, repos, github, searchCv? })` where `searchCv?: CvSearcher` defaults to `keywordSearcher(cvText)`
  - `findEvidence({ ..., searchCv?: CvSearcher })`, passed through to the tools

- [ ] **Step 1: Write the failing tests**

`hybrid-search.test.ts`:
- `"falls back to keyword results when embedding throws"`: `embedQuery` rejects → results equal the keyword results tagged `"keyword"`, and `onError` was called once.
- `"falls back when the vector search throws"`: same, with `vectorSearch` rejecting.
- `"an empty CV returns no matches without calling embedQuery"`: `chunks: []` → `[]`, `embedQuery` not called.
- `"counts the queries it embedded"`: two searches → `queries() === 2`.

`tools.test.ts`:
- `"search_cv uses an injected searcher"`: pass a fake `searchCv` that returns one `"meaning"` match → the tool returns `{ matches: [that match] }`.
- The existing "Kubernetes" no-match test still returns the `note`.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test lib/agent`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

Add the injected searcher. Update the `search_cv` description to: `"...Returns the best-matching CV lines with their section. matchedBy "meaning" means related wording found by meaning, not the same words: check it really proves the requirement before relying on it."` `findEvidence`'s judge and the `chunkCv` use at line 328 are unchanged.

- [ ] **Step 4: Run the tests and see them pass**

Run: `bun run test`
Expected: PASS, all tests.

- [ ] **Step 5: Checkpoint.** Files: `lib/agent/hybrid-search.ts`, `lib/agent/hybrid-search.test.ts`, `lib/agent/tools.ts`, `lib/agent/tools.test.ts`, `lib/agent/find-evidence.ts`. Message: `feat(search): inject the CV searcher into the evidence agent`.

### Task 3: Embeddings and the "may we embed?" rule

**Files:**
- Create: `lib/cv-embeddings.ts`
- Test: `lib/cv-embeddings.test.ts`

**Interfaces:**
- Produces:
  - `const EMBED_MODEL_LABEL = "google:gemini-embedding-001"`, `const EMBED_DIMENSIONS = 768`
  - `meaningSearchAllowed(aiChoice: AiChoice, env = process.env): boolean`
  - `embedDocuments(texts: string[]): Promise<{ vectors: number[][]; tokens: number; ms: number }>` (one `embedMany` call)
  - `embedQuery(text: string): Promise<{ vector: number[]; tokens: number }>`

- [ ] **Step 1: Write the failing tests** (`meaningSearchAllowed` only; no network in unit tests)
  - `undefined` choice, `AI_PROVIDER=google`, key set → `true`
  - `undefined` choice, `AI_PROVIDER=ollama` → `false`
  - `undefined` choice, `AI_PROVIDER=google`, key empty → `false`
  - `{ provider: "anthropic", apiKey: "…" }` → `false`
  - `{ provider: "google", apiKey: "…" }` (own Google key) → `false`
  - `{ provider: "ollama" }` → `false`

- [ ] **Step 2: Run and see them fail.** `bun run test lib/cv-embeddings` → FAIL.

- [ ] **Step 3: Implement.** Use `getModel(undefined)` logic (or its provider resolution) for the default provider so it matches what `run-analysis` will use. Embedding calls use `createGoogleGenerativeAI()` with the env key, `.embeddingModel("gemini-embedding-001")`, `dimensions: 768`, and `providerOptions.google.taskType`. `server-only` import at the top.

- [ ] **Step 4: Run and see them pass.** `bun run test lib/cv-embeddings` → PASS.

- [ ] **Step 5: Smoke-check one real call** (free tier): a throwaway `bun --conditions=react-server -e` call to `embedQuery("TypeScript")` prints `vector.length` only. Expected: `768`.

- [ ] **Step 6: Checkpoint.** Files: `lib/cv-embeddings.ts`, `lib/cv-embeddings.test.ts`. Message: `feat(search): Gemini embeddings for free-tier CV search`.

### Task 4: The `cv_chunk` table, storage and vector query

**Files:**
- Modify: `prisma/schema.prisma` (new model, `User.cvChunks`, `UsageKind.EMBED`)
- Create: `prisma/migrations/<timestamp>_add_cv_chunks/migration.sql`
- Create: `lib/cv-chunks.ts` (server-only)
- Modify: `app/onboarding/actions.ts` (call `saveCvChunks` after the profile upsert)
- Create: `scripts/check-vector-search.ts`; Modify: `package.json` (`"check:vector": "bun --conditions=react-server scripts/check-vector-search.ts"`)

**Interfaces:**
- Consumes: Task 1 `indexCv`, `IndexedChunk`, `VectorHit`; Task 3 `embedDocuments`, `EMBED_MODEL_LABEL`.
- Produces:
  - `saveCvChunks(userId: string, cvText: string): Promise<void>` (delete then `createMany` in one transaction, `embedding` null)
  - `loadCvChunks(userId: string): Promise<IndexedChunk[]>` (ordered by position)
  - `ensureEmbeddings(opts: { userId: string; cvText: string; jobId?: string; embed?: typeof embedDocuments }): Promise<boolean>`: creates chunks if the user has none; embeds rows whose `embedding` is null or `model ≠ EMBED_MODEL_LABEL`; writes vectors with `UPDATE cv_chunk SET embedding = $1::vector, model = $2 WHERE id = $3`; records one `EMBED` usage event; returns `false` on any failure (logged, never thrown)
  - `vectorSearch(userId: string, query: number[], limit = 10): Promise<VectorHit[]>`: `SELECT position, section, text, 1 - (embedding <=> $2::vector) AS similarity FROM cv_chunk WHERE "userId" = $1 AND model = $3 AND embedding IS NOT NULL ORDER BY embedding <=> $2::vector LIMIT $4`

Model shape (from the spec): `id String @id @default(cuid())`, `userId` (cascade), `position Int`, `section String?`, `text String`, `embedding Unsupported("vector(768)")?`, `model String?`, `createdAt DateTime @default(now())`, `@@index([userId])`, `@@map("cv_chunk")`.

- [ ] **Step 1: Schema and migration.** Edit the schema, run `bunx prisma migrate dev --create-only --name add_cv_chunks`, and add `CREATE EXTENSION IF NOT EXISTS vector;` as the first line of the generated SQL. Check the SQL is additive only (CREATE EXTENSION, CREATE TABLE, CREATE INDEX, ALTER TYPE ADD VALUE, FK). Then `bun run db:migrate`. Expected: migration applied, client regenerated.

- [ ] **Step 2: Write the check script** (`scripts/check-vector-search.ts`), which creates a throwaway user (id `check-vector-user`, deleted in `finally`, like `e2e/test-user.ts`) and asserts, printing only pass/fail lines:
  - `"sql order matches in-memory cosine"`: insert 6 chunks with hand-made 768-dim vectors (e.g. one-hot plus noise), run `vectorSearch` with a query vector, compare position order and similarities (±1e-6) to `cosineSimilarity` from `ai` computed in TS.
  - `"re-upload replaces old chunks"`: `saveCvChunks` with CV A, then CV B → `loadCvChunks` has only B's text, no vectors.
  - `"missing chunks are created and embedded"`: user with a CV and no rows; `ensureEmbeddings` with a fake `embed` returning 768-dim vectors → returns `true`, every row has a vector and `model = EMBED_MODEL_LABEL`.
  - `"embedding failure returns false and leaves the rows"`: fake `embed` throws → `false`, rows still there.
  - `"model change triggers re-embed"`: set one row's `model` to `"old"` → `ensureEmbeddings` re-embeds just that row.

- [ ] **Step 3: Run it and see it fail.** `bun run check:vector` → fails (functions missing).

- [ ] **Step 4: Implement `lib/cv-chunks.ts`** and call `saveCvChunks` from `uploadCv` after the upsert, in its own try/catch that logs and continues (the CV is saved either way).

- [ ] **Step 5: Run it and see it pass.** `bun run check:vector` → all 5 pass; throwaway user deleted (verify with a count query that prints `0`).

- [ ] **Step 6: Full checks.** `bun run test`, `bunx tsc --noEmit`, `bun run lint` → clean.

- [ ] **Step 7: Checkpoint.** Files: `prisma/schema.prisma`, `prisma/migrations/*_add_cv_chunks/`, `lib/cv-chunks.ts`, `app/onboarding/actions.ts`, `scripts/check-vector-search.ts`, `package.json`. Message: `feat(search): cv_chunk table with pgvector`. Remind her: run `bun run db:deploy` against production before deploying (same DB today, so already applied).

### Task 5: Use hybrid search in analyses

**Files:**
- Modify: `lib/run-analysis.ts`
- Create: `lib/cv-searcher.ts` (server-only wiring)

**Interfaces:**
- Consumes: Task 2 `createHybridSearcher`, `CvSearcher`; Task 3 `meaningSearchAllowed`, `embedQuery`; Task 4 `ensureEmbeddings`, `loadCvChunks`, `vectorSearch`; Task 6 sets `MEANING_FLOOR`.
- Produces:
  - `const MEANING_FLOOR: number` in `lib/agent/hybrid-search.ts` (start at `0.6`; Task 6 replaces it with the measured value)
  - `cvSearcherFor(opts: { userId: string; cvText: string; jobId: string; aiChoice: AiChoice }): Promise<{ search: CvSearcher; finish: () => Promise<void> }>`: keyword searcher when not allowed or `ensureEmbeddings` returns false; otherwise the hybrid searcher. `finish()` records one `EMBED` usage event for the run's query embeddings (`model: "gemini-embedding-001"`, tokens summed), and does nothing for keyword runs.

- [ ] **Step 1: Wire it.** In `runAnalysis`, after the free-tier check: `const cv = await cvSearcherFor({...})`; pass `searchCv: cv.search` to `findEvidence`; call `await cv.finish()` after the run, success or failure.

- [ ] **Step 2: Try it end to end on the dev server** with `AI_PROVIDER=google` locally, signed in, free tier (no own key): run one analysis.
  Expected in the dev-server log: `search_cv` lines, no errors. In the DB (print counts only): your `cv_chunk` rows all have vectors; `usage_event` has `EMBED` rows for this job.

- [ ] **Step 3: Try the fallback.** Temporarily set an invalid key in the shell env for the dev server only (not `.env`), run an analysis. Expected: it completes; the log shows one embedding error line; results come from keyword search.

- [ ] **Step 4: Try an own-key run** (paste your own Google key in Set up): no new `EMBED` rows, and no rows are embedded for a fresh user.

- [ ] **Step 5: Full checks.** `bun run test`, `bunx tsc --noEmit`, `bun run lint` → clean.

- [ ] **Step 6: Checkpoint.** Files: `lib/run-analysis.ts`, `lib/cv-searcher.ts`, `lib/agent/hybrid-search.ts`. Message: `feat(search): hybrid CV search for free-tier analyses`.

### Task 6: Retrieval eval and the floor

**Files:**
- Create: `evals/retrieval/cv.md` (fictional CV), `evals/retrieval/queries.json`
- Create: `lib/evals/retrieval.ts`, `lib/evals/retrieval.test.ts`
- Create: `scripts/eval-retrieval.ts`; Modify: `package.json` (`"eval:retrieval": "bun --conditions=react-server scripts/eval-retrieval.ts"`)
- Modify: `lib/agent/hybrid-search.ts` (`MEANING_FLOOR` set to the chosen value)

**Interfaces:**
- Consumes: Task 1 `indexCv`, `searchChunks`, `fuseRankings`; Task 3 `embedDocuments`, `embedQuery`.
- Produces:
  - `type RetrievalCase = { query: string; relevant: string[] }` (each `relevant` entry is a distinctive substring of one CV line; `[]` means no correct answer)
  - `relevantPositions(chunks: IndexedChunk[], c: RetrievalCase): Set<number>` (throws if a substring matches no chunk, so a typo can't silently lower recall)
  - `scoreRetrieval(results: { case: RetrievalCase; positions: number[] }[], chunks): { recallAt5: number; mrr: number; falseHitRate: number }`

**Fixture content:** a fictional mid-level full-stack engineer, about 40 chunks, written so keywords and meaning disagree: outcomes instead of tool names ("cut checkout drop-off by moving payments to a hosted page"), synonyms ("REST services", "mentored two juniors"), abbreviations, and a skills list. About 25 queries in the extraction-eval style ("API design", "Leading a team", "Payments integration", "Kubernetes"), including at least 5 with `relevant: []`.

- [ ] **Step 1: Write the failing tests** for `lib/evals/retrieval.ts`:
  - recall@5 = share of relevant positions in the top 5, averaged over cases that have any.
  - MRR = mean of 1/rank of the first relevant hit (0 if none in the top 5).
  - falseHitRate = share of `relevant: []` cases that return any result.
  - `relevantPositions` throws on an unmatched substring.

- [ ] **Step 2: Run and see them fail.** `bun run test lib/evals/retrieval` → FAIL.

- [ ] **Step 3: Implement the metrics**, then write the fixture and queries.

- [ ] **Step 4: Run the tests and see them pass.** `bun run test lib/evals` → PASS.

- [ ] **Step 5: Write the eval script.** Embed the fixture chunks once (`embedDocuments`), embed each query, compute vector hits in memory with `cosineSimilarity`, and report keyword, vector and hybrid for floors `0.50, 0.55, …, 0.80`. Save JSON to `evals/results/<date>-retrieval-gemini-embedding-001.json`, matching the other evals.

- [ ] **Step 6: Run it.** `bun run eval:retrieval` → a table prints. Pick the floor with the highest hybrid recall@5 whose false-hit rate is no worse than keyword's. Set `MEANING_FLOOR` to it. Write down the three rows (keyword / vector / hybrid at that floor) for the README, whatever they show.

- [ ] **Step 7: Checkpoint.** Files: `evals/retrieval/`, `lib/evals/retrieval.ts`, `lib/evals/retrieval.test.ts`, `scripts/eval-retrieval.ts`, `package.json`, `lib/agent/hybrid-search.ts`, the new `evals/results/*retrieval*.json`. Message: `eval: retrieval eval for keyword vs vector vs hybrid CV search`.

### Task 7: Evidence eval with hybrid search, README

**Files:**
- Modify: `scripts/eval-evidence.ts` (`--search keyword|hybrid`, default `hybrid`)
- Modify: `README.md`, `evals/README.md`

**Interfaces:**
- Consumes: Task 2 `createHybridSearcher`, `keywordSearcher`; Task 3 embeddings; Task 1 `indexCv`; Task 5 `MEANING_FLOOR`.

- [ ] **Step 1: Add the flag.** Hybrid mode embeds the real CV's chunks in memory (nothing written to the DB, nothing printed but counts), and passes `searchCv` to `findEvidence`. Results file name gains `-hybrid`.

- [ ] **Step 2: Run it.** `bun run eval:evidence --provider google --search hybrid` → must be **100% with 0 overclaims**. If not, raise `MEANING_FLOOR` by 0.05, rerun the retrieval eval to record the new numbers, and repeat. Stop and tell Ghania if a floor that keeps 0 overclaims makes hybrid no better than keyword.

- [ ] **Step 3: README.**
  - Architecture diagram: `search_cv` → `CV chunks (pgvector)` with a note "meaning search on the free tier".
  - A design-decisions bullet on hybrid search, the floor, why no ANN index at about 50 rows (and when one would be worth it), and that own-key and Local runs never embed the CV.
  - Evals table: a Retrieval row with the measured keyword / vector / hybrid recall@5 and false-hit rate.
  - Stack table: pgvector; updated unit test count from `bun run test`.
  - Run locally: `CREATE EXTENSION` is in the migration; Neon supports it.
  - What's next: remove the pgvector item.
  - `evals/README.md`: how the retrieval eval works and how the floor was chosen.

- [ ] **Step 4: Final verification.** `bun run test`, `bunx tsc --noEmit`, `bun run lint`, `bun run build`, `bun run e2e` (5/5), `bun run check:vector` → all clean. Report the real numbers.

- [ ] **Step 5: Checkpoint.** Files: `scripts/eval-evidence.ts`, `README.md`, `evals/README.md`, the new evidence results file, plus the spec and this plan under `docs/superpowers/`. Message: `docs: hybrid CV search in README and evals`.
