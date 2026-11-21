// Checks tailored text against its sources. Made-up numbers ("increased
// sales by 40%") are the most common and most damaging AI invention in a
// CV, so every number in the output must appear in the CV or evidence.

/** Numbers as written: "35%", "6", "3+", "1,200", "4.5", "$5k". */
const NUMBER = /\$?\d[\d,]*(?:\.\d+)?\s*(?:%|\+|k\b)?/gi;

function normalize(n: string): string {
  return n
    .toLowerCase()
    .replace(/[\s,$]/g, "")
    .replace(/\+$/, "");
}

export function numbersIn(text: string): string[] {
  return [
    ...new Set((text.match(NUMBER) ?? []).map(normalize).filter(Boolean)),
  ];
}

/**
 * Keeps a "source project" only if it names something real: a project or
 * employer mentioned in the CV, or one of the user's repos. Otherwise null.
 */
export function verifiedSource(
  source: string | null,
  cvText: string,
  repos: string[],
): string | null {
  const name = source?.trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  const repoMatch = repos.find((r) => {
    const short = r.split("/")[1]?.toLowerCase() ?? "";
    return lower === r.toLowerCase() || (short && lower.includes(short));
  });
  if (repoMatch) return repoMatch;
  // Every word of 4+ letters must appear in the CV (ignores "the", "app"…).
  const cv = cvText.toLowerCase();
  const words = lower.split(/[^a-z0-9.]+/).filter((w) => w.length >= 4);
  return words.length && words.every((w) => cv.includes(w)) ? name : null;
}

/**
 * Numbers in `text` that never appear in `sources`. Years like 2023 are
 * included: a wrong date is as bad as a wrong metric.
 */
export function unverifiedNumbers(text: string, sources: string): string[] {
  const known = new Set(numbersIn(sources));
  // "35%" in the source also covers "35" in the output, and vice versa.
  const bare = new Set([...known].map((n) => n.replace(/%|k$/, "")));
  return numbersIn(text).filter(
    (n) => !known.has(n) && !bare.has(n.replace(/%|k$/, "")),
  );
}
