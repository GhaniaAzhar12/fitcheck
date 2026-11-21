// Estimated cost of a model call, in US dollars.
//
// Prices are per million tokens, as published by each provider. Check them
// before relying on the numbers: they change. Claude prices are Anthropic's
// first-party API rates (Haiku 5.5's apply to prompts up to 100K tokens).
// A model missing here shows "price not set" rather than a guess.

type Price = { input: number; output: number };

export const PRICES: Record<string, Price> = {
  "anthropic/claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "anthropic/claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic/claude-opus-5-5": { input: 4, output: 20 },
  // Google Gemini paid-tier prices aren't listed yet: add them from
  // ai.google.dev/pricing before showing costs for own Gemini keys.
};

export type CostInput = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** True when the visitor's own API key paid for the call. */
  ownKey: boolean;
};

/** Dollars, 0 for free calls, or null when the model's price isn't known. */
export function costUsd(call: CostInput): number | null {
  if (call.provider === "ollama") return 0; // runs on your own computer
  if (call.provider === "google" && !call.ownKey) return 0; // the app's free tier
  const price = PRICES[`${call.provider}/${call.model}`];
  if (!price) return null;
  return (
    (call.inputTokens * price.input + call.outputTokens * price.output) /
    1_000_000
  );
}

/** "$0.00", "$0.0042", "$1.25", or "price not set". */
export function formatUsd(usd: number | null): string {
  if (usd === null) return "price not set";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Sums costs; the total is unknown only when no cost is known. */
export function sumUsd(costs: (number | null)[]): number | null {
  const known = costs.filter((c): c is number => c !== null);
  if (!known.length && costs.length) return null;
  return known.reduce((a, b) => a + b, 0);
}
