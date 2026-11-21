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
