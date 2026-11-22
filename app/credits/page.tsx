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
import { CREDIT_PACK, TEST_CARD } from "@/lib/credit-pack";
import { creditBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { fulfilCheckout, paymentsConfigured } from "@/lib/stripe";
import { FREE_ANALYSES_PER_DAY } from "@/lib/usage";

import { BuyButton } from "./buy-button";

export const metadata: Metadata = { title: "Credits · Fitcheck" };

const REASON_LABEL = {
  PURCHASE: "Bought a pack",
  ANALYSIS: "Fit analysis",
  REFUND: "Refund (analysis failed)",
} as const;

const price = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CREDIT_PACK.currency.toUpperCase(),
}).format(CREDIT_PACK.amount / 100);

export default function CreditsPage({ searchParams }: PageProps<"/credits">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href="/usage"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Usage
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
        <p className="text-muted-foreground">
          You get {FREE_ANALYSES_PER_DAY} free analyses a day. After that, each
          analysis uses 1 credit. Your own API key or a local model never needs
          credits.
        </p>
      </div>

      <p className="rounded-lg border border-dashed border-partial bg-partial/10 px-4 py-3 text-sm">
        <strong className="font-semibold">Test mode – demo.</strong> Payments
        run on Stripe's test environment, so no real money moves. Pay with the
        test card <span className="font-medium tabular-nums">{TEST_CARD}</span>,
        any future expiry date and any 3-digit CVC.
      </p>

      <Suspense fallback={<CardSkeleton lines={4} />}>
        <CreditsBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CreditsBody({
  searchParams,
}: Pick<PageProps<"/credits">, "searchParams">) {
  const { user } = await requireSession();
  const query = await searchParams;
  const configured = paymentsConfigured();

  // Back from Stripe: add the credits now rather than wait for the webhook.
  // Safe to repeat; the webhook and this page can't both add them.
  let notice: { tone: "met" | "gap"; text: string } | null = null;
  const sessionId =
    typeof query.session_id === "string" ? query.session_id : null;
  if (sessionId && configured) {
    try {
      const result = await fulfilCheckout(sessionId);
      notice =
        result.status === "not-paid" || result.userId !== user.id
          ? {
              tone: "gap",
              text: "That payment hasn't gone through yet. Credits appear here once it does.",
            }
          : {
              tone: "met",
              text: `Payment received. ${CREDIT_PACK.credits} credits added.`,
            };
    } catch {
      notice = {
        tone: "gap",
        text: "Couldn't check that payment with Stripe. Reload in a moment.",
      };
    }
  } else if (query.canceled) {
    notice = { tone: "gap", text: "Checkout cancelled. Nothing was charged." };
  }

  const [balance, entries] = await Promise.all([
    creditBalance(user.id),
    db.creditEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      {notice ? (
        <output
          className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === "met" ? "border-met bg-met/10" : "border-gap bg-gap/10"}`}
        >
          {notice.text}
        </output>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="text-4xl font-semibold tabular-nums">
              {balance}
            </span>{" "}
            <span className="text-base font-normal text-muted-foreground">
              {balance === 1 ? "credit" : "credits"} left
            </span>
          </CardTitle>
          <CardDescription>
            {CREDIT_PACK.credits} credits for {price}. If an analysis fails, its
            credit comes back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configured ? (
            <BuyButton
              label={`Buy ${CREDIT_PACK.credits} credits · ${price} (test)`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Payments aren't set up on this copy of Fitcheck. Add Stripe test
              keys to turn them on.
            </p>
          )}
        </CardContent>
      </Card>

      {entries.length ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Every credit added or used.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-2">When</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="pr-4 text-right sm:pr-2">
                    Credits
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 text-muted-foreground sm:pl-2">
                      {e.createdAt.toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </TableCell>
                    <TableCell>
                      {e.jobId ? (
                        <Link
                          href={`/jobs/${e.jobId}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {REASON_LABEL[e.reason]}
                        </Link>
                      ) : (
                        REASON_LABEL[e.reason]
                      )}
                    </TableCell>
                    <TableCell
                      className={`pr-4 text-right font-medium tabular-nums sm:pr-2 ${e.delta > 0 ? "text-met" : ""}`}
                    >
                      {e.delta > 0 ? `+${e.delta}` : e.delta}
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
