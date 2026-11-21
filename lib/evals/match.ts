// Matching rules for eval labels.
//   "go"        → the whole word "go" (not "google")
//   "postgres*" → any word starting with "postgres" (Postgres, PostgreSQL)
// Case-insensitive; "words" can include . - + # (Next.js, e-commerce, C#).

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termRegex(term: string): RegExp {
  const prefix = term.endsWith("*");
  const body = escapeRegex((prefix ? term.slice(0, -1) : term).toLowerCase());
  return new RegExp(`(?<![a-z0-9])${body}${prefix ? "" : "(?![a-z0-9])"}`, "i");
}

export function matchesAny(text: string, anyOf: string[]): boolean {
  return anyOf.some((term) => termRegex(term).test(text));
}
