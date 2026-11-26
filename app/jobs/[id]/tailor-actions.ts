"use server";

import type { Evidence } from "@/lib/agent/evidence";
import { aiChoiceFrom } from "@/lib/ai-choice";
import { aiErrorMessage, errorSummary } from "@/lib/ai-errors";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  generateInterviewPrep,
  type InterviewPrep,
} from "@/lib/interview-prep";
import { JobExtraction } from "@/lib/job-extraction";
import {
  readTailored,
  withEditedCoverNote,
  withEditedCv,
} from "@/lib/saved-tailoring";
import { getSession } from "@/lib/session";
import { generateTailored, type Tailored, tailorSources } from "@/lib/tailor";
import { unverifiedNumbers } from "@/lib/tailor-check";
import { recordUsage } from "@/lib/usage";

export type TailorState = { error?: string; result?: Tailored };

export type SaveEditResult =
  | { ok: true; text: string; unverified: string[]; editedAt: string }
  | { ok: false; error: string };

/**
 * Applies the person's edit to the saved tailoring. Numbers are re-checked
 * against the CV and evidence, so a typed-in "50%" that isn't in the CV is
 * still flagged. No model call.
 */
async function saveEdit(
  analysisId: string,
  text: string,
  part: "coverNote" | "cv",
): Promise<SaveEditResult> {
  const session = await getSession();
  if (!session)
    return { ok: false, error: "Your session ended. Sign in again." };

  // Only analyses of the signed-in user's own jobs.
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, status: "DONE", job: { userId: session.user.id } },
    select: { tailored: true, evidence: true },
  });
  const saved = analysis ? readTailored(analysis.tailored) : null;
  if (!analysis || !saved) {
    return { ok: false, error: "Write the tailored text first." };
  }

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true },
  });
  const sources = tailorSources(
    profile?.cvText ?? "",
    (analysis.evidence ?? []) as Evidence[],
  );
  const edit = part === "cv" ? withEditedCv : withEditedCoverNote;
  const next = edit(saved, text, unverifiedNumbers(text, sources), new Date());
  if ("error" in next) return { ok: false, error: next.error };

  await db.analysis.update({
    where: { id: analysisId },
    data: { tailored: next as unknown as Prisma.InputJsonValue },
  });
  const done = part === "cv" ? next.cv : next.coverNote;
  return {
    ok: true,
    text: done?.text ?? "",
    unverified: done?.unverified ?? [],
    editedAt: done?.editedAt ?? new Date().toISOString(),
  };
}

/** Saves the edited cover note, which the copy and downloads then use. */
export async function saveCoverNote(analysisId: string, text: string) {
  return saveEdit(analysisId, text, "coverNote");
}

/** Saves the person's CV as edited for this job. Set up's CV is untouched. */
export async function saveTailoredCv(analysisId: string, text: string) {
  return saveEdit(analysisId, text, "cv");
}

export async function tailorApplication(
  _prev: TailorState,
  formData: FormData,
): Promise<TailorState> {
  const session = await getSession();
  if (!session) return { error: "Your session ended. Sign in again." };

  const analysisId = String(formData.get("analysisId") ?? "");
  // Only analyses of the signed-in user's own jobs.
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, status: "DONE", job: { userId: session.user.id } },
    select: {
      evidence: true,
      jobId: true,
      tailored: true,
      job: { select: { extracted: true } },
    },
  });
  if (!analysis) return { error: "Run the fit analysis first." };

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success)
    return { error: "This job's requirements couldn't be read." };
  // Regenerating rewrites the bullets and note, never the edited CV.
  const editedCv = readTailored(analysis.tailored)?.cv;

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true },
  });
  if (!profile?.cvText) return { error: "Upload your CV in Set up first." };

  try {
    const generated = await generateTailored({
      job: job.data,
      evidence: (analysis.evidence ?? []) as Evidence[],
      cvText: profile.cvText,
      aiChoice: aiChoiceFrom(formData),
    });
    const result: Tailored = editedCv
      ? { ...generated, cv: editedCv }
      : generated;
    // Saved so later visits show it without another model call.
    await db.analysis.update({
      where: { id: analysisId },
      data: { tailored: result as unknown as Prisma.InputJsonValue },
    });
    await recordUsage({
      userId: session.user.id,
      jobId: analysis.jobId,
      kind: "TAILOR",
      provider: result.provider,
      model: result.modelId,
      aiChoice: aiChoiceFrom(formData),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: result.ms,
    });
    return { result };
  } catch (error) {
    console.error("[tailor]", errorSummary(error));
    return {
      error:
        aiErrorMessage(error) ?? "Couldn't write the tailored text. Try again.",
    };
  }
}

export type InterviewState = { error?: string; result?: InterviewPrep };

export async function prepareInterview(
  _prev: InterviewState,
  formData: FormData,
): Promise<InterviewState> {
  const session = await getSession();
  if (!session) return { error: "Your session ended. Sign in again." };

  const analysisId = String(formData.get("analysisId") ?? "");
  // Only analyses of the signed-in user's own jobs.
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, status: "DONE", job: { userId: session.user.id } },
    select: {
      evidence: true,
      jobId: true,
      job: { select: { extracted: true } },
    },
  });
  if (!analysis) return { error: "Run the fit analysis first." };

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success) {
    return { error: "This job's requirements couldn't be read." };
  }

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true, repos: true },
  });
  if (!profile?.cvText) return { error: "Upload your CV in Set up first." };

  try {
    const result = await generateInterviewPrep({
      job: job.data,
      evidence: (analysis.evidence ?? []) as Evidence[],
      cvText: profile.cvText,
      repos: profile.repos,
      aiChoice: aiChoiceFrom(formData),
    });
    // Saved so later visits show it without another model call.
    await db.analysis.update({
      where: { id: analysisId },
      data: { interview: result as unknown as Prisma.InputJsonValue },
    });
    await recordUsage({
      userId: session.user.id,
      jobId: analysis.jobId,
      kind: "INTERVIEW",
      provider: result.provider,
      model: result.modelId,
      aiChoice: aiChoiceFrom(formData),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: result.ms,
    });
    return { result };
  } catch (error) {
    console.error("[interview]", errorSummary(error));
    return {
      error:
        aiErrorMessage(error) ??
        "Couldn't write the interview prep. Try again.",
    };
  }
}
