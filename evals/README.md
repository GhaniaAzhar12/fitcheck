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

| Date | Model | Overall | Notes |
|---|---|---|---|
| 21 Nov 2026 | gemini-3.1-flash-lite | **98.4** | Misses: US work authorisation dropped by the "time zone" filter (case 04); seniority "unknown" for a 2+ years role (case 09) |

## Checking the labels

`bun run test` includes `lib/evals/cases.test.ts`, which fails if any label isn't grounded in its post: every concept must match the post, and every stack item, location word and trap must appear in it.

## Adding a case

1. Make `evals/jobs/<NN-name>/post.txt` (fictional or with permission).
2. Write `expected.json` following the rules above; `notes` says what makes it tricky.
3. Run `bun run test` and fix anything the label checks flag.
