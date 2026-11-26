import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { JobSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tidyCv } from "@/lib/cv-text";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";
import { readInterview, readTailored } from "@/lib/saved-tailoring";
import { requireSession } from "@/lib/session";

import { AnalysisSection } from "./analysis-section";
import { InterviewPanel } from "./interview-panel";
import { JobCost } from "./job-cost";
import { JobTabs } from "./job-tabs";
import { TailorPanel } from "./tailor-panel";

export const metadata: Metadata = { title: "Job · Fitcheck" };

// The analyzeJob server action runs on this page: the agent's research
// (up to 120 s) plus the judge (up to 90 s) on a slow free-tier model.
export const maxDuration = 300;

export default function JobPage({
  params,
  searchParams,
}: PageProps<"/jobs/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <Link
          href="/jobs/new"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          + New job
        </Link>
      </div>
      <Suspense fallback={<JobSkeleton />}>
        <JobDetails params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function JobDetails({
  params,
  searchParams,
}: Pick<PageProps<"/jobs/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  const { user } = await requireSession();

  // Scoped to the signed-in user: other people's jobs are a 404.
  const job = await db.job.findFirst({ where: { id, userId: user.id } });
  if (!job) notFound();

  const parsed = JobExtraction.safeParse(job.extracted);
  if (!parsed.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>We couldn't read the saved result</CardTitle>
          <CardDescription>Try adding this job again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const data = parsed.data;

  const facts = [
    data.seniority !== "unknown" && label(data.seniority),
    data.remote !== "unknown" && label(data.remote),
    data.location,
    data.minYearsExperience !== null && `${data.minYearsExperience}+ years`,
    data.salary,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="flex flex-col gap-4">
      {query.existing === "1" ? (
        <output className="block rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          You already saved this job on{" "}
          {job.createdAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
          , so here it is instead of a copy.
        </output>
      ) : null}
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-xl">{data.title}</CardTitle>
          <CardDescription>
            {data.company ?? "Company not stated"}
            {job.url ? (
              <>
                {" · "}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Original post
                </a>
              </>
            ) : null}
          </CardDescription>
          {facts.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {facts.map((fact) => (
                <Badge key={fact} variant="secondary">
                  {fact}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <JobTabs
        report={
          <>
            <AnalysisSection jobId={job.id} autoStart={query.analyze === "1"} />

            <RequirementList title="Must have" items={data.mustHave} />
            <RequirementList title="Nice to have" items={data.niceToHave} />

            <Card>
              <CardHeader>
                <CardTitle>Stack</CardTitle>
              </CardHeader>
              <CardContent>
                {data.stack.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.stack.map((tech) => (
                      <Badge key={tech} variant="outline">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None named.</p>
                )}
              </CardContent>
            </Card>

            <JobCost jobId={job.id} />

            <details className="rounded-xl border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium">Raw JSON</summary>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </>
        }
        tailor={<TailorSection jobId={job.id} userId={user.id} />}
      />

      <p className="text-xs text-muted-foreground">
        Saved{" "}
        {job.createdAt.toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })}{" "}
        · Status: {label(job.status.toLowerCase())}
      </p>
    </div>
  );
}

/** Tailoring uses the latest successful analysis for its evidence. */
async function TailorSection({
  jobId,
  userId,
}: {
  jobId: string;
  userId: string;
}) {
  const [analysis, profile] = await Promise.all([
    db.analysis.findFirst({
      where: { jobId, status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, tailored: true, interview: true },
    }),
    db.profile.findUnique({ where: { userId }, select: { cvText: true } }),
  ]);
  const cv = profile?.cvText
    ? { original: profile.cvText, starting: tidyCv(profile.cvText) }
    : null;
  // Saved results: shown as-is, no model call on reload.
  const savedTailored = readTailored(analysis?.tailored);
  const savedInterview = readInterview(analysis?.interview);

  const needsAnalysis = (
    <p className="text-sm text-muted-foreground">
      Run <strong>Analyse my fit</strong> on the Report tab first, so this can
      use the evidence it finds.
    </p>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tailor your application</CardTitle>
          <CardDescription>
            CV bullets and a cover note for this job, written only from your CV
            and the evidence Fitcheck found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <TailorPanel
              analysisId={analysis.id}
              saved={savedTailored}
              cv={cv}
            />
          ) : (
            needsAnalysis
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interview prep</CardTitle>
          <CardDescription>
            10 questions this interviewer is likely to ask, with answers based
            on your own projects, including the hard ones about your gaps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <InterviewPanel analysisId={analysis.id} saved={savedInterview} />
          ) : (
            needsAnalysis
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RequirementList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}{" "}
          <span className="font-normal text-muted-foreground">
            ({items.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None listed.</p>
        )}
      </CardContent>
    </Card>
  );
}

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
