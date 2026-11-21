"use server";

import { revalidatePath } from "next/cache";

import { aiChoiceFrom } from "@/lib/ai-choice";
import { AnalysisError, runAnalysis } from "@/lib/run-analysis";
import { getSession } from "@/lib/session";

export type AnalyzeState = { error?: string; doneAt?: number };

export async function analyzeJob(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  const session = await getSession();
  if (!session) return { error: "Your session ended. Sign in again." };

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return { error: "Missing job." };

  try {
    await runAnalysis({
      userId: session.user.id,
      jobId,
      aiChoice: aiChoiceFrom(formData),
    });
  } catch (error) {
    return {
      error:
        error instanceof AnalysisError
          ? error.message
          : "The analysis failed. Try again.",
    };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { doneAt: Date.now() };
}
