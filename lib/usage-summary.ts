import { costUsd, sumUsd } from "@/lib/pricing";

// Groups usage events for the /usage page. Pure, so it's easy to test.

export type UsageEventLike = {
  kind: string;
  provider: string;
  model: string;
  ownKey: boolean;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  createdAt: Date;
};

export type UsageTotals = {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  cost: number | null;
};

export function totals(events: UsageEventLike[]): UsageTotals {
  return {
    calls: events.length,
    failed: events.filter((e) => !e.ok).length,
    inputTokens: events.reduce((s, e) => s + e.inputTokens, 0),
    outputTokens: events.reduce((s, e) => s + e.outputTokens, 0),
    ms: events.reduce((s, e) => s + e.ms, 0),
    cost: sumUsd(
      events.map((e) =>
        costUsd({
          provider: e.provider,
          model: e.model,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          ownKey: e.ownKey,
        }),
      ),
    ),
  };
}

/** One row per UTC day, newest first; days without calls are skipped. */
export function byDay(events: UsageEventLike[]) {
  const groups = new Map<string, UsageEventLike[]>();
  for (const e of events) {
    const day = e.createdAt.toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, ...totals(list) }));
}

/** One row per kind of call, most tokens first. */
export function byKind(events: UsageEventLike[]) {
  const groups = new Map<string, UsageEventLike[]>();
  for (const e of events)
    groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]);
  return [...groups]
    .map(([kind, list]) => ({ kind, ...totals(list) }))
    .sort(
      (a, b) =>
        b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
    );
}
