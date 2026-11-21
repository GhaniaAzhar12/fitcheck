import { headers } from "next/headers";

import type { Evidence } from "@/lib/agent/evidence";
import { aiChoiceFrom } from "@/lib/ai-choice";
import { errorSummary } from "@/lib/ai-errors";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { streamFitReport } from "@/lib/fit-report";
import { JobExtraction } from "@/lib/job-extraction";

// Streaming a report on a slow free-tier model can take a while.
export const maxDuration = 120;

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

/**
 * Streams the written fit report for one analysis as plain text, then
 * saves it so later visits show it without another model call.
 * Body: optional form fields aiProvider / aiKey (the visitor's own key).
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/analyses/[id]/report">,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return fail(401, "Your session ended. Sign in again.");

  const { id } = await params;
  // Only analyses of the signed-in user's own jobs.
  const analysis = await db.analysis.findFirst({
    where: { id, status: "DONE", job: { userId: session.user.id } },
    select: {
      id: true,
      evidence: true,
      score: true,
      job: { select: { extracted: true } },
    },
  });
  if (!analysis) return fail(404, "That analysis wasn't found.");

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success)
    return fail(422, "This job's requirements couldn't be read.");

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true },
  });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    formData = new FormData();
  }

  try {
    const result = streamFitReport({
      job: job.data,
      evidence: (analysis.evidence ?? []) as Evidence[],
      score: analysis.score,
      cvText: profile?.cvText ?? "",
      aiChoice: aiChoiceFrom(formData),
      onDone: async (text) => {
        await db.analysis.update({
          where: { id: analysis.id },
          data: { report: text },
        });
      },
    });
    return result.toTextStreamResponse({
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[report]", errorSummary(error));
    return fail(500, "Couldn't write the report. Try again.");
  }
}
