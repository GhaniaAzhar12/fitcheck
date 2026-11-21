// Day 24: score the evidence agent's met/partial/gap answers against
// hand labels for the author's CV and repos (evals/evidence/*.json).
//
//   bun run eval:evidence                    → default model
//   bun run eval:evidence --provider google
//
// Uses the first user's CV, repos and GitHub token from the database.
// Results are saved to evals/results/<date>-evidence-<model>.json.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { Octokit } from "@octokit/rest";

import { findEvidence } from "@/lib/agent/find-evidence";
import { octokitRepoApi } from "@/lib/agent/repo-files";
import { db } from "@/lib/db";
import {
  jobFor,
  judge,
  loadEvidenceCases,
  summarizeEvidence,
  type Verdict,
} from "@/lib/evals/evidence";
import { getModel, PROVIDERS, type Provider } from "@/lib/model";

const { values: args } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    job: { type: "string" },
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

const profile = await db.profile.findFirstOrThrow({
  select: { userId: true, cvText: true, repos: true },
});
const account = await db.account.findFirstOrThrow({
  where: { userId: profile.userId, providerId: "github" },
  select: { accessToken: true, accessTokenExpiresAt: true },
});
if (account.accessTokenExpiresAt && account.accessTokenExpiresAt < new Date()) {
  console.warn(
    "⚠ GitHub token has expired: sign in to the app again, or repo evidence will fail.\n",
  );
}
const github = octokitRepoApi(
  new Octokit({
    auth: account.accessToken ?? undefined,
    userAgent: "fitcheck",
  }),
);

const cases = (await loadEvidenceCases()).filter(
  (c) => !args.job || c.job.startsWith(args.job),
);
if (!cases.length) throw new Error(`No job matches "${args.job}".`);
console.log(
  `Evidence eval: ${cases.length} jobs with ${provider}/${modelId}\n`,
);

const ICON = {
  correct: "✓",
  overclaim: "▲ over",
  underclaim: "▼ under",
} as const;
const results = [];
const allVerdicts: Verdict[] = [];
const failedJobs: string[] = [];

for (const c of cases) {
  const job = jobFor(c, c.expected);
  const ordered = [
    ...c.requirements.filter((r) => r.kind === "mustHave"),
    ...c.requirements.filter((r) => r.kind === "niceToHave"),
  ];
  try {
    const run = await findEvidence({
      job,
      cvText: profile.cvText ?? "",
      repos: profile.repos,
      github,
      modelOptions,
    });
    // findEvidence keeps requirement order: must-haves, then nice-to-haves.
    const rows = ordered.map((req, i) => {
      const got = run.evidence[i]?.status ?? "gap";
      const verdict = judge(got, req.expect);
      return {
        requirement: req.text,
        expect: req.expect,
        got,
        verdict,
        proof: run.evidence[i]?.proof ?? null,
      };
    });
    const verdicts = rows.map((r) => r.verdict);
    allVerdicts.push(...verdicts);
    const s = summarizeEvidence(verdicts);
    console.log(
      `${c.job.padEnd(32)} ${s.correct}/${s.total} correct · ${s.overclaims} over · ${s.underclaims} under · ${run.toolCalls.length} tool calls · ${(run.ms / 1000).toFixed(1)}s`,
    );
    for (const r of rows.filter((x) => x.verdict !== "correct")) {
      console.log(
        `    ${ICON[r.verdict]}  ${r.requirement}: got ${r.got}, expected ${r.expect.join("/")}${r.proof ? ` — "${r.proof.slice(0, 90)}"` : ""}`,
      );
    }
    results.push({
      job: c.job,
      rows,
      toolCalls: run.toolCalls.length,
      ms: run.ms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : String(error);
    console.log(`${c.job.padEnd(32)} FAILED: ${message}`);
    // A failed run never answered: count it as a failure, not as wrong answers.
    failedJobs.push(c.job);
    results.push({ job: c.job, error: message });
  }
}

const summary = { ...summarizeEvidence(allVerdicts), failedJobs };
console.log(
  `\nAccuracy: ${summary.accuracy}% (${summary.correct}/${summary.total} answered) · overclaims ${summary.overclaims} · underclaims ${summary.underclaims}${failedJobs.length ? ` · ${failedJobs.length} job(s) failed to run: ${failedJobs.join(", ")}` : ""}`,
);

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const dir = join(process.cwd(), "evals", "results");
await mkdir(dir, { recursive: true });
const file = join(
  dir,
  `${stamp}-evidence-${provider}-${modelId.replace(/[^\w.-]/g, "_")}.json`,
);
await writeFile(
  file,
  `${JSON.stringify({ ranAt: new Date().toISOString(), provider, modelId, summary, jobs: results }, null, 2)}\n`,
);
console.log(`Saved ${file.replace(`${process.cwd()}/`, "")}`);
await db.$disconnect();
process.exit(0);
