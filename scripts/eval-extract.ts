// Day 23: score job extraction against the hand-labelled eval set.
//
//   bun run eval:extract                          → default model (AI_PROVIDER)
//   bun run eval:extract --provider ollama        → local, free, no limits
//   bun run eval:extract --provider google --model gemini-3.5-flash-lite
//   bun run eval:extract --case 05                → one case (prefix match)
//
// Results are saved to evals/results/<date>-<model>.json.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { loadCases } from "@/lib/evals/cases";
import {
  type CaseScore,
  scoreCase,
  summarize,
  WEIGHTS,
} from "@/lib/evals/score";
import { extractJob } from "@/lib/extract-job";
import type { JobExtraction } from "@/lib/job-extraction";
import { getModel, PROVIDERS, type Provider } from "@/lib/model";

const { values: args } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    case: { type: "string" },
  },
});

if (
  args.provider &&
  !(PROVIDERS as readonly string[]).includes(args.provider)
) {
  throw new Error(`--provider must be one of ${PROVIDERS.join(", ")}`);
}
const modelOptions = {
  provider: args.provider as Provider | undefined,
  modelId: args.model,
};
const { provider, modelId } = getModel(modelOptions);

const cases = (await loadCases()).filter(
  (c) => !args.case || c.id.startsWith(args.case),
);
if (!cases.length) throw new Error(`No case matches "${args.case}".`);

console.log(`Evaluating ${cases.length} case(s) with ${provider}/${modelId}\n`);

type Row = {
  id: string;
  score: CaseScore | null;
  output: JobExtraction | null;
  error: string | null;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
};
const rows: Row[] = [];

for (const c of cases) {
  process.stdout.write(`  ${c.id} … `);
  const started = Date.now();
  try {
    const result = await extractJob(c.post, modelOptions);
    const score = scoreCase(result.data, c.expected);
    rows.push({
      id: c.id,
      score,
      output: result.data,
      error: null,
      ms: result.ms,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    console.log(`${score.score}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : String(error);
    rows.push({
      id: c.id,
      score: null,
      output: null,
      error: message,
      ms: Date.now() - started,
    });
    console.log(`FAILED: ${message}`);
  }
}

// ─── Table ───────────────────────────────────────────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}`.padStart(4);
const ok = (x: number) => (x ? "  ✓" : "  ✗");
console.log(
  `\n${"case".padEnd(30)} score  must nice stack  sen rem loc yrs sal trap  time`,
);
for (const r of rows) {
  if (!r.score) {
    console.log(`${r.id.padEnd(30)}  fail  ${r.error?.slice(0, 50)}`);
    continue;
  }
  const m = r.score.metrics;
  console.log(
    `${r.id.padEnd(30)} ${r.score.score.toFixed(0).padStart(5)} ${pct(m.mustRecall)} ${pct(m.niceRecall)} ${pct(m.stackRecall)} ${ok(m.seniority)} ${ok(m.remote)} ${ok(m.location)} ${ok(m.years)} ${ok(m.salary)} ${ok(m.traps)}  ${(r.ms / 1000).toFixed(1)}s`,
  );
}

const summary = summarize(rows.map((r) => r.score));
console.log(
  `\nOverall: ${summary.overall}/100 · must-have recall ${summary.metrics.mustRecall}% · stack recall ${summary.metrics.stackRecall}% (precision ${summary.stackPrecision}%) · seniority ${summary.metrics.seniority}% · location ${summary.metrics.location}% · traps avoided ${summary.metrics.traps}%${summary.failed ? ` · ${summary.failed} failed` : ""}`,
);

// What went wrong, so a low score says why.
const problems = rows.flatMap((r) => {
  if (!r.score) return [];
  const s = r.score;
  const parts = [
    s.missedMust.length && `missed must: ${s.missedMust.join(", ")}`,
    s.misplaced.length && `misplaced: ${s.misplaced.join(", ")}`,
    s.missedNice.length && `missed nice: ${s.missedNice.join(", ")}`,
    s.missedStack.length && `missed stack: ${s.missedStack.join(", ")}`,
    s.extraStack.length && `extra stack: ${s.extraStack.join(", ")}`,
    s.trapsHit.length && `TRAPS: ${s.trapsHit.join(", ")}`,
    !s.metrics.seniority && `seniority: ${r.output?.seniority}`,
    !s.metrics.location && `location: ${r.output?.location ?? "null"}`,
    !s.metrics.years && `years: ${r.output?.minYearsExperience ?? "null"}`,
    !s.metrics.remote && `remote: ${r.output?.remote}`,
    !s.metrics.salary && `salary: ${r.output?.salary ?? "null"}`,
  ].filter(Boolean);
  return parts.length ? [`  ${r.id}: ${parts.join(" · ")}`] : [];
});
if (problems.length) console.log(`\nMisses:\n${problems.join("\n")}`);

// ─── Save ────────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = join(process.cwd(), "evals", "results");
await mkdir(dir, { recursive: true });
const file = join(
  dir,
  `${stamp}-${provider}-${modelId.replace(/[^\w.-]/g, "_")}.json`,
);
await writeFile(
  file,
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      provider,
      modelId,
      weights: WEIGHTS,
      summary,
      cases: rows,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nSaved ${file.replace(`${process.cwd()}/`, "")}`);
process.exit(0);
