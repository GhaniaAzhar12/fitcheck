import type Stripe from "stripe";

import { fulfilCheckout, paymentsConfigured, stripe } from "@/lib/stripe";

/**
 * Stripe calls this when a Checkout Session finishes. The signature is
 * checked before anything else, then the credits are added (once, however
 * many times Stripe retries). Locally: `stripe listen --forward-to
 * localhost:3005/api/stripe/webhook`.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured()) {
    return new Response("Payments aren't set up.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature.", { status: 400 });

  let event: Stripe.Event;
  try {
    // The raw body, exactly as sent: re-serialised JSON would fail the check.
    event = await stripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  switch (event.type) {
    // Cards finish here. Slower payment methods finish in the second event;
    // fulfilCheckout only adds credits once the session is actually paid.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const result = await fulfilCheckout(event.data.object);
      console.info(
        `[stripe] ${event.type} ${event.data.object.id}: ${result.status}`,
      );
      break;
    }
    case "checkout.session.async_payment_failed":
      console.warn(`[stripe] payment failed for ${event.data.object.id}`);
      break;
    default:
      // Not ours to handle; a 200 stops Stripe retrying it.
      break;
  }
  return Response.json({ received: true });
}
