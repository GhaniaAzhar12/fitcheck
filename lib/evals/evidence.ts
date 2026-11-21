import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { EVIDENCE_STATUS, type EvidenceStatus } from "@/lib/agent/evidence";
import type { JobExtraction } from "@/lib/job-extraction";

import { type Expected, Expected as ExpectedSchema } from "./cases";

// Evidence eval: for a job's requirements, which statuses an honest judge
// could give for the author's CV and repos (evals/evidence/*.json).
// Calibrated to one person's profile, so it measures the judge, not the job.

const EvidenceCase = z.object({
  job: z.string(),
  requirements: z
    .array(
      z.object({
        text: z.string().min(2),
        kind: z.enum(["mustHave", "niceToHave"]),
        expect: z.array(z.enum(EVIDENCE_STATUS)).min(1),
      }),
    )
    .min(1),
});
export type EvidenceCase = z.infer<typeof EvidenceCase>;

export const EVIDENCE_DIR = join(process.cwd(), "evals", "evidence");

export async function loadEvidenceCases(dir = EVIDENCE_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (f) => {
      const c = EvidenceCase.parse(
        JSON.parse(await readFile(join(dir, f), "utf8")),
      );
      const expected = ExpectedSchema.parse(
        JSON.parse(
          await readFile(
            join(process.cwd(), "evals", "jobs", c.job, "expected.json"),
            "utf8",
          ),
        ),
      );
      return { ...c, expected };
    }),
  );
}

/** The job as the agent sees it: the case's requirements, the label's facts. */
export function jobFor(c: EvidenceCase, expected: Expected): JobExtraction {
  return {
    title: expected.title,
    company: expected.company,
    seniority: expected.seniority[0] ?? "unknown",
    remote: expected.remote,
    location: null,
    minYearsExperience: expected.minYearsExperience,
    mustHave: c.requirements
      .filter((r) => r.kind === "mustHave")
      .map((r) => r.text),
    niceToHave: c.requirements
      .filter((r) => r.kind === "niceToHave")
      .map((r) => r.text),
    stack: expected.stack,
    salary: null,
  };
}

const RANK: Record<EvidenceStatus, number> = { gap: 0, partial: 1, met: 2 };

export type Verdict = "correct" | "overclaim" | "underclaim";

/** Correct if acceptable; otherwise more generous (over) or stricter (under). */
export function judge(got: EvidenceStatus, expect: EvidenceStatus[]): Verdict {
  if (expect.includes(got)) return "correct";
  return RANK[got] > Math.max(...expect.map((s) => RANK[s]))
    ? "overclaim"
    : "underclaim";
}

export function summarizeEvidence(verdicts: Verdict[]) {
  const n = verdicts.length || 1;
  const count = (v: Verdict) => verdicts.filter((x) => x === v).length;
  return {
    accuracy: Math.round((count("correct") / n) * 1000) / 10,
    correct: count("correct"),
    overclaims: count("overclaim"),
    underclaims: count("underclaim"),
    total: verdicts.length,
  };
}
