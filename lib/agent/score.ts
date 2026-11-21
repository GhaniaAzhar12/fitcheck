import type { Evidence } from "./evidence";

const WEIGHT = { mustHave: 2, niceToHave: 1 } as const;
const CREDIT = { met: 1, partial: 0.5, gap: 0 } as const;

/**
 * Fit score 0–100, calculated (not guessed by a model) so the same evidence
 * always gives the same score. Must-haves count double; partial = half.
 * Returns null when there are no requirements to score.
 */
export function fitScore(evidence: Evidence[]): number | null {
  let earned = 0;
  let possible = 0;
  for (const e of evidence) {
    earned += WEIGHT[e.kind] * CREDIT[e.status];
    possible += WEIGHT[e.kind];
  }
  return possible ? Math.round((100 * earned) / possible) : null;
}
