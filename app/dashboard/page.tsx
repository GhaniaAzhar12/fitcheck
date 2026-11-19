import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard · Fitcheck" };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<UserCardSkeleton />}>
        <UserCard />
      </Suspense>
    </main>
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
