"use server";

import { redirect } from "next/navigation";

import { CHECKOUT_KIND, CREDIT_PACK } from "@/lib/credit-pack";
import { requireSession } from "@/lib/session";
import { paymentsConfigured, stripe } from "@/lib/stripe";

/** Opens Stripe Checkout (test mode) for one 10-credit pack. */
export async function buyCredits(): Promise<{ error: string } | undefined> {
  const { user } = await requireSession();
  if (!paymentsConfigured()) {
    return { error: "Payments aren't set up on this copy of Fitcheck." };
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3005";
  let url: string | null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CREDIT_PACK.currency,
            unit_amount: CREDIT_PACK.amount,
            product_data: {
              name: CREDIT_PACK.name,
              description:
                "Test mode demo: use a Stripe test card, no real money.",
            },
          },
        },
      ],
      client_reference_id: user.id,
      metadata: { kind: CHECKOUT_KIND, credits: String(CREDIT_PACK.credits) },
      success_url: `${base}/credits?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/credits?canceled=1`,
      integration_identifier: "fitcheck_credits_qmvtrzke",
    });
    url = session.url;
  } catch (error) {
    console.error(
      "[stripe] checkout failed",
      error instanceof Error ? error.message : error,
    );
    return { error: "Stripe didn't open the checkout. Try again." };
  }
  if (!url) return { error: "Stripe didn't open the checkout. Try again." };
  redirect(url);
}
