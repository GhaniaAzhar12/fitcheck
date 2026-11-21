import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { GitHubError, listPublicRepos } from "@/lib/github";
import {
  isOnboarded,
  MAX_REPOS,
  minReposFor,
  nextStep,
  type OnboardingStep,
} from "@/lib/onboarding";
import { requireSession } from "@/lib/session";

import { CvUploadForm } from "./cv-upload-form";
import { ModelSettings } from "./model-settings";
import { RepoPicker } from "./repo-picker";

export const metadata: Metadata = { title: "Set up · Fitcheck" };

const STEPS = ["Your CV", "Your repos", "AI model"] as const;

type Profile = {
  cvText: string | null;
  cvFileName: string | null;
  cvPages: number | null;
  repos: string[];
  updatedAt: Date;
} | null;

export default function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up Fitcheck
        </h1>
        <p className="text-muted-foreground">
          Fitcheck looks for proof in your CV and GitHub repos. Takes about a
          minute.
        </p>
      </div>
      <Suspense
        fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}
      >
        <Onboarding searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Onboarding({
  searchParams,
}: Pick<PageProps<"/onboarding">, "searchParams">) {
  const { user } = await requireSession();
  const profile: Profile = await db.profile.findUnique({
    where: { userId: user.id },
    select: {
      cvText: true,
      cvFileName: true,
      cvPages: true,
      repos: true,
      updatedAt: true,
    },
  });

  // Go to the requested step, but never past the first unfinished one.
  const requested = Number((await searchParams).step);
  const furthest = nextStep(profile);
  const step = (
    requested >= 1 && requested <= 3 ? Math.min(requested, furthest) : furthest
  ) as OnboardingStep;

  return (
    <>
      <ol className="flex gap-2 text-sm" aria-label="Setup steps">
        {STEPS.map((label, i) => {
          const n = (i + 1) as OnboardingStep;
          const current = n === step;
          const reachable = n <= furthest;
          const done = n < furthest || (n === 3 && isOnboarded(profile));
          const className = `flex-1 rounded-lg border px-3 py-2 ${
            current
              ? "border-foreground/30 bg-card font-medium"
              : "text-muted-foreground"
          }`;
          const content = (
            <>
              <span className="mr-1.5 text-muted-foreground">
                {done && !current ? "✓" : `${n}.`}
              </span>
              {label}
            </>
          );
          return (
            <li key={label} className="flex flex-1">
              {reachable && !current ? (
                <Link
                  href={`/onboarding?step=${n}`}
                  className={`${className} hover:bg-muted/50`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={current ? "step" : undefined}
                  className={className}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 ? <CvStep profile={profile} /> : null}
      {step === 2 ? (
        <ReposStep userId={user.id} saved={profile?.repos ?? []} />
      ) : null}
      {step === 3 ? <ModelStep /> : null}
    </>
  );
}

function CvStep({ profile }: { profile: Profile }) {
  const cvText = profile?.cvText ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>1. Upload your CV</CardTitle>
          <CardDescription>
            Fitcheck reads the text to match your experience against job
            requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CvUploadForm hasCv={Boolean(cvText)} />
        </CardContent>
      </Card>

      {cvText ? (
        <Card>
          <CardHeader>
            <CardTitle>What we read from your CV</CardTitle>
            <CardDescription>
              {profile?.cvFileName ?? "CV"} · {profile?.cvPages ?? "?"}{" "}
              {profile?.cvPages === 1 ? "page" : "pages"} ·{" "}
              {cvText.length.toLocaleString("en-GB")} characters · saved{" "}
              {profile?.updatedAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed">
              {cvText}
            </pre>
            <div>
              <Link href="/onboarding?step=2" className={buttonVariants()}>
                Looks right, continue
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

async function ReposStep({
  userId,
  saved,
}: {
  userId: string;
  saved: string[];
}) {
  let content: React.ReactNode;
  try {
    const repos = await listPublicRepos(userId);
    content = repos.length ? (
      <RepoPicker repos={repos} saved={saved} min={minReposFor(repos.length)} />
    ) : (
      <p className="text-sm text-muted-foreground">
        You don't have any public repos yet. Make one of your projects public on
        GitHub, then reload this page.
      </p>
    );
  } catch (error) {
    content = (
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {error instanceof GitHubError
          ? error.message
          : "We couldn't load your repos. Try again."}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Choose your evidence repos</CardTitle>
        <CardDescription>
          Pick 3–{MAX_REPOS} public repos that show your best work. Fitcheck
          reads their code to find proof for each job requirement.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function ModelStep() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Choose the AI model</CardTitle>
        <CardDescription>
          You can change this any time from Set up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ModelSettings
          localAvailable={process.env.NODE_ENV === "development"}
        />
      </CardContent>
    </Card>
  );
}
