# Hybrid CV search (keyword + meaning) with pgvector

Status: draft for approval · 2026-11-24

## Why

Fitcheck's evidence agent finds proof in the CV through `search_cv`, which is
keyword-only (`lib/agent/cv-search.ts`): it counts shared words, helped by a
hand-made alias list. It misses proof worded differently from the job post
("built REST services" vs "API design", "led a team of 6" vs "mentoring").

The goal is twofold:

1. **Product:** the agent finds CV proof that uses different words from the job
   post, without making more false claims.
2. **Portfolio:** a measured retrieval feature (embeddings, pgvector, hybrid
   ranking, a retrieval eval) that Ghania can demo and defend in interviews for
   senior full-stack TypeScript + AI roles.

## Goals

- `search_cv` returns the best CV chunks from **both** keyword and meaning-based
  search, merged into one ranking.
- CV chunks and their embeddings live in Postgres (pgvector on Neon), written
  once when the CV is uploaded.
- A **retrieval eval** shows, with numbers, how keyword, vector and hybrid
  search compare on a labelled set.
- The existing evidence eval still scores 100% with 0 overclaims.

## Non-goals

- No reranker model, no approximate-nearest-neighbour index (HNSW/IVFFlat):
  each user has about 30–60 chunks, so an exact scan filtered by user is faster
  and exact. The README says when an index would become worth it.
- No embeddings for GitHub repo code (the agent reads files directly).
- No new UI beyond the README.
- No meaning-based search for Ollama yet: its similarity scale differs from
  Gemini's, so it would need its own floor and eval run. Local mode stays
  keyword-only.
- No new data flows: users with their own key or Local mode never have their CV
  embedded (see Privacy).

## Anti-goals (a failure even if it works)

- **More overclaims.** Vector search always returns *something*; weakly related
  chunks must not push the judge into "met".
- **A slower or flakier analysis.** If embeddings are down, search falls back to
  keyword-only, silently and quickly.
- **A broken CV upload.** Embedding failure never blocks saving the CV.
- **Committing the real CV.** Eval data uses a fictional CV.

## Approaches considered

| | How | Trade-off |
|---|---|---|
| **A. pgvector (chosen)** | `cv_chunk` table with a `vector(768)` column; cosine search in SQL; merged with keyword results | Most realistic retrieval stack and the one job posts name; costs a migration and some raw SQL next to Prisma. |
| B. JSON on the profile, cosine in TypeScript | Embeddings stored as JSON; compare in memory | Leaner and arguably right at 50 vectors; less to demo. Kept as the interview "when I wouldn't need this" answer. |
| C. Embed on every search, store nothing | Embed query + all chunks per call | Dropped: re-embeds the whole CV on every tool call. |

Ghania asked for the best option; A was chosen for the portfolio goal.

**Revision from the first sketch:** the keyword half stays the existing
TypeScript scorer, not Postgres full-text search. The current scorer knows
aliases (`pg` → `postgresql`, `k8s` → `kubernetes`) that Postgres's English
dictionary doesn't, and it's already unit-tested. Rankings are merged in
TypeScript.

## Design

### Data

New Prisma model (raw `vector` via `Unsupported`), migration enables the
extension:

```
cv_chunk
  id         text pk
  userId     text fk → user, on delete cascade
  position   int            -- order in the CV
  section    text null      -- "EXPERIENCE", from chunkCv
  text       text
  embedding  vector(768) null   -- null when embedding failed
  model      text null      -- e.g. "google:gemini-embedding-001"
  createdAt  timestamptz
  index (userId)
```

`CREATE EXTENSION IF NOT EXISTS vector;` goes in the migration (Neon supports
it).

### Chunking and embedding

- Chunks come from the existing `chunkCv(cvText)`, unchanged.
- **Who gets meaning-based search:** only analyses that run on the **app's own
  Gemini key** (the free tier). Those users already send their CV to Google.
  Own-key (Google or Anthropic) and Local runs use keyword search exactly as
  today, and their CV is never embedded. Decided by Ghania, 2026-11-24.
- **Embedding model:** Google `gemini-embedding-001` at 768 dimensions, with
  task type "retrieval document" for chunks and "retrieval query" for queries,
  on the app's Google key.
- Each row records which model made its vector (`model`).
- **When:** the provider choice lives in the browser, so the server only knows
  it at analysis time. On CV upload, replace the user's chunks in one
  transaction with `embedding = null` (no AI call). At the start of a
  free-tier analysis, embed any chunks with no vector or a different `model`
  (this also handles existing users and a model change). If embedding fails,
  that run is keyword-only; the analysis still succeeds.
- Embedding calls are logged in `UsageEvent` with a new `EMBED` kind (no job
  for upload-time calls; the job's id when it happens during an analysis), so
  `/usage` and "Cost of this job" include them. $0 on the free tier.

### Search (`search_cv`)

1. **Keyword list:** existing `searchCv` scoring over the user's chunks.
2. **Vector list:** embed the query, then
   `ORDER BY embedding <=> $query LIMIT 10` for this user's chunks with the
   same model, returning cosine similarity.
3. **Merge with reciprocal rank fusion** (k = 60): each chunk's score is the sum
   of `1 / (k + rank)` over the lists it appears in.
4. **Floor for meaning-only hits:** a chunk found only by vector search is kept
   only if its similarity is above a threshold, tuned on the retrieval eval.
   This is the main overclaim guard.
5. Return the top 5, each tagged `matchedBy: "keyword" | "meaning" | "both"`.
   The tool description tells the agent a "meaning" match is related wording to
   verify, not proof on its own.

Pure parts (fusion, floor, tagging) live in a no-I/O module with unit tests,
like `cv-search.ts` today.

### Retrieval eval

- `evals/retrieval/cv.md`: a **fictional** CV written with deliberate wording
  gaps (synonyms, outcomes instead of tool names, abbreviations).
- `evals/retrieval/queries.json`: about 25 requirement-style queries, each
  labelled with the CV lines that are real proof (matched by a distinctive
  substring, so labels survive chunking tweaks). Include some queries with **no**
  correct answer, to measure false hits.
- `bun run eval:retrieval --provider google` reports, for keyword, vector and
  hybrid: recall@5, MRR and false-hit rate on no-answer queries. Results are saved to
  `evals/results/` like the other evals.
- The eval runs in memory (same embedding, fusion and floor code; cosine in TS)
  so it needs no database. A separate integration test checks the SQL path
  returns the same top results as the in-memory path.
- After it lands, rerun `eval:evidence --provider google` with hybrid search
  (in memory, real CV from the database, nothing committed): it must stay at
  100% with 0 overclaims, or the floor is tightened. Google is the only
  provider gated, matching the saved results.

### Privacy and copy

- No new data flows, so no new notice or setting: embedding happens only on
  the app's Gemini key, which already receives the CV on the free tier.
- README: architecture diagram gains the chunk/embedding step and says which
  runs use it; Evals table
  gains the retrieval row with the real measured numbers (whatever they are,
  including "hybrid didn't beat keyword" if that's what happens).

## Left to the builder

- Exact threshold value (from the eval), file names for new modules, how the
  integration test seeds a user (reuse the e2e test-user pattern).
- How `findEvidence` learns the user id and whether meaning search is allowed
  (expected: passed in by `run-analysis.ts`, which knows the provider choice).
- How embeddings are batched (`embedMany` in one call is expected to fit).
