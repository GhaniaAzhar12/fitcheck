import { describe, expect, test } from "bun:test";

import {
  CHECKOUT_KIND,
  CREDIT_PACK,
  creditsForSession,
  isTestKey,
  type PaidSessionLike,
} from "./credit-pack";

const paid = (over: Partial<PaidSessionLike> = {}): PaidSessionLike => ({
  id: "cs_test_123",
  mode: "payment",
  payment_status: "paid",
  client_reference_id: "user_1",
  amount_total: CREDIT_PACK.amount,
  currency: CREDIT_PACK.currency,
  metadata: { kind: CHECKOUT_KIND, credits: String(CREDIT_PACK.credits) },
  ...over,
});

describe("creditsForSession", () => {
  test("a paid pack credits the buyer", () => {
    expect(creditsForSession(paid())).toEqual({
      userId: "user_1",
      credits: CREDIT_PACK.credits,
    });
  });

  test("nothing until the payment has gone through", () => {
    expect(creditsForSession(paid({ payment_status: "unpaid" }))).toBeNull();
  });

  test("ignores other sessions on the same Stripe account", () => {
    expect(creditsForSession(paid({ metadata: null }))).toBeNull();
    expect(creditsForSession(paid({ mode: "subscription" }))).toBeNull();
    expect(creditsForSession(paid({ client_reference_id: null }))).toBeNull();
  });

  test("refuses a session whose price doesn't match the pack", () => {
    expect(creditsForSession(paid({ amount_total: 1 }))).toBeNull();
    expect(creditsForSession(paid({ currency: "eur" }))).toBeNull();
    expect(
      creditsForSession(
        paid({ metadata: { kind: CHECKOUT_KIND, credits: "1000" } }),
      ),
    ).toBeNull();
  });
});

describe("isTestKey", () => {
  test("accepts test keys only", () => {
    expect(isTestKey("sk_test_abc")).toBe(true);
    expect(isTestKey("rk_test_abc")).toBe(true);
    expect(isTestKey("rkcs_test_abc")).toBe(true);
    expect(isTestKey("pk_test_abc")).toBe(false);
    expect(isTestKey("rkcs_live_abc")).toBe(false);
    expect(isTestKey("sk_live_abc")).toBe(false);
    expect(isTestKey("rk_live_abc")).toBe(false);
    expect(isTestKey("")).toBe(false);
    expect(isTestKey(undefined)).toBe(false);
  });
});
