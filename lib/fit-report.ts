import "server-only";

import { streamText } from "ai";

import type { Evidence } from "@/lib/agent/evidence";
import type { AiChoice } from "@/lib/ai-choice";
import type { JobExtraction } from "@/lib/job-extraction";
import { getModel, MODEL_RETRIES } from "@/lib/model";

const TIMEOUT_MS = 90_000;
/** The top of the CV usually holds location, years and a summary. */
const CV_INTRO_CHARS = 700;

export const REPORT_INSTRUCTIONS = `You write a short, honest fit report for a job seeker deciding whether to apply.
Write in plain English, second person ("you"), no hype. Use ONLY the facts given.
Use exactly this format, with these four headings:

## Verdict: Apply | Apply with a plan | Skip
One or two sentences on why, mentioning the score.

## Your strongest points
- 2 to 4 bullets, each naming the concrete proof (a CV line or a repo file).

## Gaps to address
- One bullet per must-have gap or weak point, each with one practical way to handle it (what to say, or a small thing to build or learn). Write "None" if there are no gaps.

## Pitch
One sentence the person could open a cover note with.

Rules for the verdict:
- Apply: score 70 or more and no blocking must-have gap.
- Apply with a plan: score 45–69, or a strong match with one or two fixable gaps.
- Skip: score under 45, or a hard blocker the person can't fix soon (e.g. a location or right-to-work rule they clearly don't meet, or a core skill with no evidence at all).
If the job limits where you can live or work and the CV shows a different location, say so in the verdict.`;

export function buildReportPrompt({
  job,
  evidence,
  score,
  cvText,
}: {
  job: JobExtraction;
  evidence: Evidence[];
  score: number | null;
  cvText: string;
}): string {
  const facts = [
    `Job: ${job.title}${job.company ? ` at ${job.company}` : ""}`,
    `Seniority: ${job.seniority}`,
    `Work: ${job.remote}${job.location ? ` (${job.location})` : ""}`,
    job.minYearsExperience !== null &&
      `Minimum experience: ${job.minYearsExperience} years`,
    job.salary && `Salary: ${job.salary}`,
  ].filter(Boolean);

  const lines = evidence.map((e) => {
    const kind = e.kind === "mustHave" ? "must have" : "nice to have";
    const source = e.source.ref ? ` [${e.source.type}: ${e.source.ref}]` : "";
    return `- ${e.status.toUpperCase()} (${kind}) ${e.requirement}${e.proof ? ` — ${e.proof}` : ""}${source}`;
  });

  return [
    facts.join("\n"),
    `Fit score: ${score ?? "unknown"}/100 (calculated from the evidence below; must-haves count double, partial = half)`,
    `Evidence per requirement:\n${lines.join("\n")}`,
    `Top of the candidate's CV (for location and experience):\n"""\n${cvText.slice(0, CV_INTRO_CHARS)}\n"""`,
  ].join("\n\n");
}

export function streamFitReport(options: {
  job: JobExtraction;
  evidence: Evidence[];
  score: number | null;
  cvText: string;
  aiChoice?: AiChoice;
  onDone: (
    text: string,
    usage: { inputTokens: number; outputTokens: number; ms: number },
  ) => Promise<void>;
}) {
  const { model } = getModel(options.aiChoice);
  const started = Date.now();
  return streamText({
    model,
    instructions: REPORT_INSTRUCTIONS,
    prompt: buildReportPrompt(options),
    temperature: 0.2,
    maxRetries: MODEL_RETRIES,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    onEnd: async ({ text, totalUsage }) => {
      if (!text.trim()) return;
      await options.onDone(text.trim(), {
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        ms: Date.now() - started,
      });
    },
  });
}
