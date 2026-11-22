import "server-only";

import Stripe from "stripe";

import { creditsForSession, isTestKey } from "@/lib/credit-pack";
import { addPurchasedCredits } from "@/lib/credits";

let client: Stripe | null = null;

/** True when a Stripe test key and webhook secret are set. */
export function paymentsConfigured(): boolean {
  return (
    isTestKey(process.env.STRIPE_SECRET_KEY) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  );
}

/** The Stripe client. Refuses live keys: this is a test-mode demo. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!isTestKey(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a test key (sk_test_ or rk_test_).",
    );
  }
  client ??= new Stripe(key as string);
  return client;
}

/**
 * Adds the credits for a Checkout Session if it's ours and paid. Called by
 * the webhook (the source of truth) and by the return page, so credits show
 * up straight away even if the webhook is a moment late. Idempotent.
 */
export async function fulfilCheckout(
  sessionOrId: string | Stripe.Checkout.Session,
): Promise<{
  status: "added" | "already-added" | "not-paid";
  userId?: string;
}> {
  // Always read the session back from Stripe, so nothing is taken on trust.
  const id = typeof sessionOrId === "string" ? sessionOrId : sessionOrId.id;
  const session = await stripe().checkout.sessions.retrieve(id);
  const grant = creditsForSession(session);
  if (!grant) return { status: "not-paid" };
  const status = await addPurchasedCredits({
    ...grant,
    stripeSessionId: session.id,
  });
  return { status, userId: grant.userId };
}
