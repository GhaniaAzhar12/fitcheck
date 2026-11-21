"use server";

import type { Evidence } from "@/lib/agent/evidence";
import { aiChoiceFrom } from "@/lib/ai-choice";
import { aiErrorMessage, errorSummary } from "@/lib/ai-errors";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";
import { getSession } from "@/lib/session";
import { generateTailored, type Tailored } from "@/lib/tailor";

export type TailorState = { error?: string; result?: Tailored };

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
    select: { evidence: true, job: { select: { extracted: true } } },
  });
  if (!analysis) return { error: "Run the fit analysis first." };

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success)
    return { error: "This job's requirements couldn't be read." };

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true },
  });
  if (!profile?.cvText) return { error: "Upload your CV in Set up first." };

  try {
    const result = await generateTailored({
      job: job.data,
      evidence: (analysis.evidence ?? []) as Evidence[],
      cvText: profile.cvText,
      aiChoice: aiChoiceFrom(formData),
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
