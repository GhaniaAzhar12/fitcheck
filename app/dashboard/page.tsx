import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { isOnboarded } from "@/lib/onboarding";
import { requireSession } from "@/lib/session";
import { TrackerTable } from "./tracker-table";

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
        <TrackerTable />
      </Suspense>
    </main>
  );
}

async function UserCard() {
  const { user } = await requireSession();

  // New users set up their CV and repos before anything else.
  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { cvText: true, repos: true },
  });
  if (!isOnboarded(profile)) redirect("/onboarding");

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
          <CardDescription>
            {user.email} · {profile?.repos.length} evidence repo
            {profile?.repos.length === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <Link
          href="/onboarding?step=1"
          className={buttonVariants({ variant: "ghost" })}
        >
          Set up
        </Link>
        <SignOutButton />
      </CardHeader>
    </Card>
  );
}

function UserCardSkeleton() {
  return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
}
