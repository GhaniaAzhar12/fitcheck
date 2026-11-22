import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CardSkeleton } from "@/components/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { creditBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { formatUsd } from "@/lib/pricing";
import { requireSession } from "@/lib/session";
import { FREE_ANALYSES_PER_DAY, freeAnalysesToday } from "@/lib/usage";
import { byDay, byKind, totals } from "@/lib/usage-summary";

export const metadata: Metadata = { title: "Usage · Fitcheck" };

const DAYS = 14;

const KIND_LABEL: Record<string, string> = {
  EXTRACT: "Read job post",
  ANALYSIS: "Fit analysis",
  REPORT: "Fit report",
  TAILOR: "Tailored text",
  INTERVIEW: "Interview prep",
  KEY_CHECK: "Key check",
};

const n = (x: number) => x.toLocaleString("en-GB");

export default function UsagePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">
          Every AI call Fitcheck made for you in the last {DAYS} days.
        </p>
      </div>
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <UsageReport />
      </Suspense>
    </main>
  );
}

async function UsageReport() {
  const { user } = await requireSession();
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const [events, freeUsed, credits] = await Promise.all([
    db.usageEvent.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
    freeAnalysesToday(user.id),
    creditBalance(user.id),
  ]);

  const all = totals(events);
  const days = byDay(events);
  const kinds = byKind(events);
  const freeLeft = Math.max(0, FREE_ANALYSES_PER_DAY - freeUsed);
  const freePct = Math.min(100, (freeUsed / FREE_ANALYSES_PER_DAY) * 100);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Free analyses today</CardTitle>
          <CardDescription>
            {freeUsed} of {FREE_ANALYSES_PER_DAY} used in the last 24 hours.{" "}
            {freeLeft
              ? `${freeLeft} left.`
              : "Each analysis now uses 1 credit."}{" "}
            Your own key or a local model has no limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div
            role="progressbar"
            aria-label="Free analyses used today"
            aria-valuemin={0}
            aria-valuemax={FREE_ANALYSES_PER_DAY}
            aria-valuenow={freeUsed}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={`h-full rounded-full ${freeLeft ? "bg-met" : "bg-gap"}`}
              style={{ width: `${freePct}%` }}
            />
          </div>
          <p className="text-sm">
            <span className="font-medium tabular-nums">{credits}</span>{" "}
            {credits === 1 ? "credit" : "credits"} left for extra analyses ·{" "}
            <Link href="/credits" className="underline underline-offset-4">
              Buy credits (test mode)
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last {DAYS} days</CardTitle>
          <CardDescription>
            {n(all.calls)} calls · {n(all.inputTokens)} tokens in ·{" "}
            {n(all.outputTokens)} out · {(all.ms / 1000).toFixed(0)}s of model
            time · {formatUsd(all.cost)}
            {all.failed ? ` · ${all.failed} failed` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {days.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-2">Day (UTC)</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Tokens in / out</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead className="pr-4 text-right sm:pr-2">
                    Cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.day}>
                    <TableCell className="pl-4 sm:pl-2">
                      {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(
                        "en-GB",
                        { weekday: "short", day: "numeric", month: "short" },
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.calls}
                      {d.failed ? (
                        <span className="ml-1 text-xs text-gap">
                          ({d.failed} failed)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(d.inputTokens)} / {n(d.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(d.ms / 1000).toFixed(0)}s
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums sm:pr-2">
                      {formatUsd(d.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-4 text-sm text-muted-foreground sm:px-0">
              No AI calls yet. Add a job to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {kinds.length ? (
        <Card>
          <CardHeader>
            <CardTitle>By step</CardTitle>
            <CardDescription>
              Which parts of Fitcheck use the most tokens.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-2">Step</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Tokens in / out</TableHead>
                  <TableHead className="text-right">Avg time</TableHead>
                  <TableHead className="pr-4 text-right sm:pr-2">
                    Cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kinds.map((k) => (
                  <TableRow key={k.kind}>
                    <TableCell className="pl-4 sm:pl-2">
                      {KIND_LABEL[k.kind] ?? k.kind}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.calls}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(k.inputTokens)} / {n(k.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(k.ms / k.calls / 1000).toFixed(1)}s
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums sm:pr-2">
                      {formatUsd(k.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
