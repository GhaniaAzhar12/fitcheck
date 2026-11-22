// The one thing Fitcheck sells, in Stripe test mode only (no real money).
// Kept free of server imports so pages and tests can use it.

export const CREDIT_PACK = {
  credits: 10,
  /** In the smallest currency unit: 500 = $5.00. */
  amount: 500,
  currency: "usd",
  name: "10 Fitcheck analysis credits",
} as const;

/** Tags our Checkout Sessions so other events on the account are ignored. */
export const CHECKOUT_KIND = "fitcheck_credits";

/** Stripe's standard test card: works in test mode, never in live mode. */
export const TEST_CARD = "4242 4242 4242 4242";

/** The parts of a Checkout Session that decide whether to add credits. */
export type PaidSessionLike = {
  id: string;
  mode: string | null;
  payment_status: string;
  client_reference_id: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
};

/**
 * Who to credit, and how many credits, for a finished Checkout Session.
 * Null when the session isn't ours, isn't paid yet, or doesn't match the
 * pack's price: nothing is added on a partial or tampered session.
 */
export function creditsForSession(
  s: PaidSessionLike,
): { userId: string; credits: number } | null {
  if (s.mode !== "payment") return null;
  // "no_payment_required" can't happen for a priced pack, so only "paid".
  if (s.payment_status !== "paid") return null;
  if (s.metadata?.kind !== CHECKOUT_KIND) return null;
  if (!s.client_reference_id) return null;
  if (s.amount_total !== CREDIT_PACK.amount) return null;
  if (s.currency !== CREDIT_PACK.currency) return null;
  if (Number(s.metadata.credits) !== CREDIT_PACK.credits) return null;
  return { userId: s.client_reference_id, credits: CREDIT_PACK.credits };
}

/**
 * Only secret or restricted test keys are accepted, so this demo can never
 * take real money. Sandbox keys from `stripe sandboxes create` start rkcs_test_.
 */
export function isTestKey(key: string | undefined): boolean {
  return Boolean(key && /^(sk|rk|rkcs)_test_/.test(key));
}
