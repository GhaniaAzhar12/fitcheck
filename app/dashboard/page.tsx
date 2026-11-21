import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard · Fitcheck" };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link href="/jobs/new" className={buttonVariants()}>
          + New job
        </Link>
      </div>
      <Suspense fallback={<UserCardSkeleton />}>
        <UserCard />
      </Suspense>
      <Suspense fallback={<UserCardSkeleton />}>
        <JobList />
      </Suspense>
    </main>
  );
}

async function JobList() {
  const { user } = await requireSession();
  const jobs = await db.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, extracted: true, createdAt: true },
  });

  if (!jobs.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No jobs yet</CardTitle>
          <CardDescription>
            Add your first job post to see its requirements.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your jobs</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {jobs.map((job) => {
            const data = JobExtraction.safeParse(job.extracted).data;
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex items-baseline justify-between gap-4 py-3 hover:text-foreground/70"
                >
                  <span className="font-medium">
                    {data?.title ?? "Untitled job"}
                    {data?.company ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {data.company}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {job.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

async function UserCard() {
  const { user } = await requireSession();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={48}
            height={48}
            className="rounded-full"
          />
        ) : null}
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle>Hi, {user.name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </div>
        <SignOutButton />
      </CardHeader>
    </Card>
  );
}

function UserCardSkeleton() {
  return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
}
