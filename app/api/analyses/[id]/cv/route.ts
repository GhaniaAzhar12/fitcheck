import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { tidyCv } from "@/lib/cv-text";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";
import { readTailored } from "@/lib/saved-tailoring";
import { cvFileName, tailoredCvDocx, tailoredCvPdf } from "@/lib/tailored-cv";

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

/**
 * Downloads the CV as edited for this job: ?format=pdf (default) or docx.
 * Before any edit is saved, it's the CV from Set up with tidied line breaks.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/analyses/[id]/cv">,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return fail(401, "Your session ended. Sign in again.");

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "docx")
    return fail(400, "Choose pdf or docx.");

  const { id } = await params;
  // Only analyses of the signed-in user's own jobs.
  const analysis = await db.analysis.findFirst({
    where: { id, status: "DONE", job: { userId: session.user.id } },
    select: { tailored: true, job: { select: { extracted: true } } },
  });
  if (!analysis) return fail(404, "That analysis wasn't found.");

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success)
    return fail(422, "This job's requirements couldn't be read.");

  let text = readTailored(analysis.tailored)?.cv?.text;
  if (!text) {
    const profile = await db.profile.findUnique({
      where: { userId: session.user.id },
      select: { cvText: true },
    });
    if (!profile?.cvText) return fail(404, "Upload your CV in Set up first.");
    text = tidyCv(profile.cvText);
  }

  const file =
    format === "pdf" ? await tailoredCvPdf(text) : await tailoredCvDocx(text);
  const name = cvFileName(job.data.company, job.data.title, format);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
