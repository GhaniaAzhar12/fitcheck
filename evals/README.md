# Evals

Hand-labelled job posts for measuring how well Fitcheck pulls requirements out of a post. All posts are **fictional** samples written for testing.

## Layout

```
evals/jobs/<NN-name>/
  post.txt        the job post, as a user would paste it
  expected.json   what a correct extraction contains
```

## The 10 cases

| Case | What it tests |
|---|---|
| 01 senior-fullstack-remote | Baseline senior remote role; time-zone overlap and perks aren't requirements |
| 02 frontend-hybrid-london | Hybrid, UK right to work, no salary |
| 03 ai-engineer-remote-americas | "pgvector is a plus" inside the must list → nice to have; Americas-only remote |
| 04 backend-anywhere-but-us | Header says "Anywhere in the World", body requires US work authorisation |
| 05 application-traps | "Put *blue whale* in the subject", take-home, AI disclosure, "self-starter" |
| 06 junior-react-lahore | Junior, 0 years, on-site Lahore, salary in PKR per month |
| 07 staff-platform-prose | Requirements written as paragraphs, "it would be a bonus" for nice-to-haves |
| 08 freelance-react-native | Hourly rate, part-time hours |
| 09 marketing-heavy | Long marketing copy, real requirements in two sentences |
| 10 django-react-south-asia | "Minimum" vs "Preferred qualifications", South Asia remote, USD monthly pay |

## Labelling rules

- **mustHave / niceToHave** are *concepts*, one skill, experience or qualification each. `anyOf` lists the words that count as finding it.
  - `go` matches the whole word only (not "google"); a trailing `*` matches word prefixes: `postgres*` covers Postgres and PostgreSQL.
- **Years of experience** are scored through `minYearsExperience`, not as a must-have concept.
- **Right to work** counts as a requirement (it decides the verdict). **Working arrangements** (time zones, overlap hours, part-time hours) and **application steps** go in `mustNotInclude`.
- **seniority** lists every honestly acceptable answer (e.g. "Staff" → `lead` or `principal`).
- **locationAnyOf** passes if the extracted location contains any of the words; `null` means the post states no location.
- **stack** uses each technology's usual spelling.

## Running the eval

```bash
bun run eval:extract --provider google        # free Gemini (what the live app uses)
bun run eval:extract --provider ollama        # local model, free and unlimited
bun run eval:extract --case 04                # one case
```

Each case scores 0–100 from weighted checks: must-have recall 30, stack recall 15, nice-to-have recall 10, location 10, seniority 10, no traps 10, remote type 5, years 5, salary stated 5. The script prints a table and the misses, and saves the full run (scores, model outputs, model) to `evals/results/<date>-<provider>-<model>.json`.

## Results

### Extraction (`eval:extract`, 10 cases)

| Date | Model | Overall | Must-have recall | Seniority | Notes |
|---|---|---|---|---|---|
| 21 Nov 2026 (before) | gemini-3.1-flash-lite | 98.4 | 98% | 90% | Case 04: US work authorisation dropped by the "time zone" filter. Case 09: seniority "unknown" for a 2+ years role |
| 21 Nov 2026 (after) | gemini-3.1-flash-lite | **99.8** | **100%** | **100%** | Fixes: eligibility rules always kept; seniority inferred from years. Only miss: Figma left out of one stack |

### Evidence (`eval:evidence`, 5 jobs, 37 requirements)

| Date | Model | Accuracy | Overclaims | Underclaims | Notes |
|---|---|---|---|---|---|
| 21 Nov 2026 (run 1) | gemini-3.1-flash-lite | **100%** | 0 | 0 | Every gap on the React Native job called a gap |
| 21 Nov 2026 (run 2) | gemini-3.1-flash-lite | **100%** | 0 | 0 | Same result: consistent between runs |

Free-tier Gemini sometimes times out after many calls in a row; a timed-out case is reported as failed and re-run, not counted as a wrong answer.

## The evidence eval

`evals/evidence/<job>.json` lists a job's requirements and, for each, the statuses an honest judge could give (`met`, `partial`, `gap`). The labels are calibrated to the author's own CV and GitHub repos, so this eval measures the judge, not the job. A status outside the acceptable set is an **overclaim** (too generous: the costly mistake in a fit check) or an **underclaim** (too strict).

```bash
bun run eval:evidence --provider google       # needs a signed-in user's CV, repos and GitHub token in the database
bun run eval:evidence --job 08                # one job
```

## The retrieval eval

`evals/retrieval/cv.md` is a **fictional** CV written so keywords and meaning disagree (outcomes instead of tool names, synonyms, abbreviations). `queries.json` has 28 requirement-style queries, each labelled with distinctive substrings of the CV lines that really prove it; 6 have no right answer, to measure false hits. A label that matches no chunk fails the run, so a typo can't quietly lower the score.

```bash
bun run eval:retrieval    # keyword vs vector vs hybrid; uses the app's Gemini key for embeddings
```

It reports recall@5 (share of the proof in the top 5), MRR (how high the first proof ranks) and the false-hit rate, for keyword, vector and hybrid at floors from 0.50 to 0.80. The floor in `lib/agent/hybrid-search.ts` is the highest-recall floor with no more false hits than keyword search. On the first run (2026-11-24): keyword 45.5% recall@5, hybrid at 0.65 86.4%, both with 0 false hits; at 0.60 half the no-answer queries got a hit, because the best no-answer similarity was 0.612. 28 queries is a small set, so treat the floor as a starting point.

## Checking the labels

`bun run test` includes `lib/evals/cases.test.ts`, which fails if any label isn't grounded in its post: every concept must match the post, and every stack item, location word and trap must appear in it.

## Adding a case

1. Make `evals/jobs/<NN-name>/post.txt` (fictional or with permission).
2. Write `expected.json` following the rules above; `notes` says what makes it tricky.
3. Run `bun run test` and fix anything the label checks flag.
