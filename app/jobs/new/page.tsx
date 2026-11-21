import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CardSkeleton } from "@/components/skeletons";
import { requireSession } from "@/lib/session";

import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = { title: "New job · Fitcheck" };

// The createJob server action runs on this page. Fetching the page (15 s)
// plus a slow free-tier model call (90 s) needs more than Vercel's default.
export const maxDuration = 120;

export default function NewJobPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New job</h1>
        <p className="text-muted-foreground">
          Paste a job link or the job text. We'll pull out the requirements.
        </p>
      </div>
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <SignedInForm />
      </Suspense>
    </main>
  );
}

async function SignedInForm() {
  await requireSession();
  return <NewJobForm />;
}
