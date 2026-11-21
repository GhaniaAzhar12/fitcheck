import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { Evidence } from "@/lib/agent/evidence";
import type { AiChoice } from "@/lib/ai-choice";
import type { JobExtraction } from "@/lib/job-extraction";
import { getModel, MODEL_RETRIES } from "@/lib/model";
import type { SavedTailored } from "@/lib/saved-tailoring";
import { unverifiedNumbers } from "@/lib/tailor-check";

const TIMEOUT_MS = 90_000;
const MAX_CV_CHARS = 12_000;

export const TailoredOutput = z.object({
  cvBullets: z
    .array(z.string().min(10).max(320))
    .min(3)
    .max(6)
    .describe(
      "5 CV bullet points rewritten for this job, each starting with a strong past-tense verb",
    ),
  coverNote: z
    .string()
    .min(80)
    .max(1_800)
    .describe("A short cover note, 120 to 180 words, first person"),
});

/** The same shape that is saved on the Analysis. */
export type Tailored = SavedTailored;

const INSTRUCTIONS = `You tailor a candidate's real CV for one job. Truth matters more than polish.

Hard rules:
- Use ONLY facts in the CV and the evidence notes. Never invent employers, projects, numbers, dates, team sizes, tools or results.
- Keep every number exactly as the CV states it. If the CV has no number for something, don't add one.
- Rephrase to match the job's wording only where the CV supports it (e.g. "REST APIs" if the CV says so).
- Don't claim skills the evidence marks as a gap.

CV bullets: exactly 5. Pick the experience most relevant to this job's must-haves. Start each with a strong past-tense verb (Built, Led, Cut, Shipped…). One line each, 15–30 words.

Cover note: 120–180 words, first person, plain and specific. Open with why this role fits, name 2–3 concrete proofs from the CV or repos, and end with one line inviting a chat. No "I am writing to apply", no "passionate", no buzzwords. Don't mention salary. If a must-have is a gap, you may briefly say how you WOULD close it ("I'd get up to speed on AWS by…"). Never claim you are already learning, doing or certified in something unless the CV says so.`;

function evidenceNotes(evidence: Evidence[]) {
  return evidence
    .map((e) => {
      const kind = e.kind === "mustHave" ? "must have" : "nice to have";
      const source = e.source.ref ? ` [${e.source.type}: ${e.source.ref}]` : "";
      return `- ${e.status.toUpperCase()} (${kind}) ${e.requirement}${e.proof ? ` — ${e.proof}` : ""}${source}`;
    })
    .join("\n");
}

export async function generateTailored({
  job,
  evidence,
  cvText,
  aiChoice,
}: {
  job: JobExtraction;
  evidence: Evidence[];
  cvText: string;
  aiChoice?: AiChoice;
}): Promise<Tailored> {
  const { provider, modelId, model } = getModel(aiChoice);
  const started = Date.now();
  const notes = evidenceNotes(evidence);

  const { output, usage } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: [
      `Job: ${job.title}${job.company ? ` at ${job.company}` : ""} (${job.seniority}, ${job.remote}${job.location ? `, ${job.location}` : ""})`,
      `Must have: ${job.mustHave.join("; ") || "not stated"}`,
      `Nice to have: ${job.niceToHave.join("; ") || "none"}`,
      `Evidence found for each requirement:\n${notes}`,
      `The candidate's CV:\n"""\n${cvText.slice(0, MAX_CV_CHARS)}\n"""`,
    ].join("\n\n"),
    output: Output.object({
      schema: TailoredOutput,
      name: "tailored_application",
    }),
    temperature: 0.3,
    maxRetries: MODEL_RETRIES,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Anything numeric must trace back to the CV or the evidence.
  const sources = `${cvText}\n${notes}`;
  return {
    cvBullets: output.cvBullets.map((text) => ({
      text: text.trim(),
      unverified: unverifiedNumbers(text, sources),
    })),
    coverNote: {
      text: output.coverNote.trim(),
      unverified: unverifiedNumbers(output.coverNote, sources),
    },
    provider,
    modelId,
    ms: Date.now() - started,
    generatedAt: new Date().toISOString(),
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}
