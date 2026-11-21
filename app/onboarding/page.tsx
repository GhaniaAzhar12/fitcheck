import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { CvUploadForm } from "./cv-upload-form";

export const metadata: Metadata = { title: "Set up · Fitcheck" };

const STEPS = ["Your CV", "Your repos", "AI model"] as const;

export default function OnboardingPage() {
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

      <ol className="flex gap-2 text-sm" aria-label="Setup steps">
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === 0 ? "step" : undefined}
            className={
              i === 0
                ? "flex-1 rounded-lg border border-foreground/20 bg-card px-3 py-2 font-medium"
                : "flex-1 rounded-lg border px-3 py-2 text-muted-foreground"
            }
          >
            <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}
      >
        <CvStep />
      </Suspense>
    </main>
  );
}

async function CvStep() {
  const { user } = await requireSession();
  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { cvText: true, cvFileName: true, cvPages: true, updatedAt: true },
  });
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
          <CardContent>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed">
              {cvText}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Next: choose the GitHub repos to use as evidence (coming in the
              next step).
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
