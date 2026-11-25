import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  coverLetterDocx,
  coverLetterFileName,
  coverLetterPdf,
  letterParts,
} from "@/lib/cover-letter";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";
import { readTailored } from "@/lib/saved-tailoring";

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

/**
 * Downloads the saved cover note as a letter: ?format=pdf (default) or docx.
 * Uses only the text already saved on the analysis, so it costs no model call.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/analyses/[id]/cover-letter">,
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

  const tailored = readTailored(analysis.tailored);
  if (!tailored?.coverNote.text.trim())
    return fail(404, "Write the tailored text first.");

  const job = JobExtraction.safeParse(analysis.job.extracted);
  if (!job.success)
    return fail(422, "This job's requirements couldn't be read.");

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { cvText: true },
  });

  const parts = letterParts({
    userName: session.user.name,
    email: session.user.email,
    cvText: profile?.cvText ?? "",
    company: job.data.company,
    jobTitle: job.data.title,
    body: tailored.coverNote.text,
    date: new Date(),
  });
  const file =
    format === "pdf"
      ? await coverLetterPdf(parts)
      : await coverLetterDocx(parts);
  const name = coverLetterFileName(job.data.company, job.data.title, format);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
