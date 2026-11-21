import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { Evidence } from "@/lib/agent/evidence";
import type { AiChoice } from "@/lib/ai-choice";
import type { JobExtraction } from "@/lib/job-extraction";
import { getModel, MODEL_RETRIES } from "@/lib/model";
import { unverifiedNumbers, verifiedSource } from "@/lib/tailor-check";

const TIMEOUT_MS = 120_000;
const MAX_CV_CHARS = 12_000;

export const QUESTION_TYPES = ["technical", "behavioural"] as const;

export const InterviewPrepOutput = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(10).max(300),
        type: z.enum(QUESTION_TYPES),
        whyAsked: z
          .string()
          .max(300)
          .describe(
            "One sentence: which requirement or concern this question tests",
          ),
        answer: z
          .string()
          .min(40)
          .max(1_500)
          .describe(
            "A first-person answer of 80 to 150 words, built only from the CV and evidence",
          ),
        sourceProject: z
          .string()
          .nullable()
          .describe(
            "The CV project, employer or repo the answer draws on, exactly as named there; null if none",
          ),
      }),
    )
    .min(6)
    .max(12),
});

export type InterviewQuestion = {
  question: string;
  type: (typeof QUESTION_TYPES)[number];
  whyAsked: string;
  answer: string;
  sourceProject: string | null;
  unverified: string[];
};

export type InterviewPrep = {
  questions: InterviewQuestion[];
  provider: string;
  modelId: string;
  ms: number;
};

const INSTRUCTIONS = `You prepare a candidate for an interview for one job, using their real CV and the evidence found for each requirement.

Write exactly 10 questions an interviewer for THIS job is likely to ask:
- About 6 technical questions on the job's must-haves and stack, and about 4 behavioural ones (ownership, teamwork, conflict, a hard problem, impact).
- Include 2 questions that probe the candidate's gaps or weak points (requirements marked GAP or PARTIAL), so they can practise honest answers.

Answers:
- First person, 80–150 words, spoken style (how they'd say it out loud).
- Behavioural answers follow Situation → Task → Action → Result.
- Technical answers explain the approach, then ground it in a real project from the CV or repos.
- When describing a project, only state technical details the CV or evidence mentions (e.g. don't add "real-time", "WebSockets", "caching" or "memoization" to a project unless written there). General technique goes in its own sentence, phrased as "I'd usually…" or "My approach is…", not as something done on that project.
- Use ONLY facts from the CV and evidence. Never invent projects, employers, numbers, dates or results. Keep numbers exactly as the CV states them.
- For a gap, answer honestly: what related experience they have and how they would get up to speed. Never claim experience they don't have.
- sourceProject: the CV project, employer or repo the answer draws on, named exactly as in the CV or repo list. null if none.`;

function evidenceNotes(evidence: Evidence[]) {
  return evidence
    .map((e) => {
      const kind = e.kind === "mustHave" ? "must have" : "nice to have";
      const source = e.source.ref ? ` [${e.source.type}: ${e.source.ref}]` : "";
      return `- ${e.status.toUpperCase()} (${kind}) ${e.requirement}${e.proof ? ` — ${e.proof}` : ""}${source}`;
    })
    .join("\n");
}

export async function generateInterviewPrep({
  job,
  evidence,
  cvText,
  repos,
  aiChoice,
}: {
  job: JobExtraction;
  evidence: Evidence[];
  cvText: string;
  repos: string[];
  aiChoice?: AiChoice;
}): Promise<InterviewPrep> {
  const { provider, modelId, model } = getModel(aiChoice);
  const started = Date.now();
  const notes = evidenceNotes(evidence);

  const { output } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: [
      `Job: ${job.title}${job.company ? ` at ${job.company}` : ""} (${job.seniority}, ${job.remote}${job.location ? `, ${job.location}` : ""})`,
      `Stack: ${job.stack.join(", ") || "not stated"}`,
      `Evidence per requirement:\n${notes}`,
      `Candidate's repos: ${repos.join(", ") || "none"}`,
      `Candidate's CV:\n"""\n${cvText.slice(0, MAX_CV_CHARS)}\n"""`,
    ].join("\n\n"),
    output: Output.object({
      schema: InterviewPrepOutput,
      name: "interview_prep",
    }),
    temperature: 0.4,
    maxRetries: MODEL_RETRIES,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const sources = `${cvText}\n${notes}`;
  return {
    questions: output.questions.slice(0, 10).map((q) => ({
      question: q.question.trim(),
      type: q.type,
      whyAsked: q.whyAsked.trim(),
      answer: q.answer.trim(),
      sourceProject: verifiedSource(q.sourceProject, cvText, repos),
      unverified: unverifiedNumbers(q.answer, sources),
    })),
    provider,
    modelId,
    ms: Date.now() - started,
  };
}
