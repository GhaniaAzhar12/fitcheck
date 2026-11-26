// Plain-text CV handling for the tailored CV. No PDF or Word code here, so
// the editor can use it in the browser.

const KNOWN_HEADINGS =
  /^(summary|profile|professional summary|about( me)?|objective|experience|work experience|employment( history)?|education|skills|technical skills|projects|certifications?|languages|awards|publications|volunteering|interests|achievements)$/i;
const NO_BULLETS_SECTION = /summary|profile|about|objective/i;
const BULLET = /^[•\-*–▪●◦]\s+/;
// "Frontend: React…" starts a new line even when the one above is long.
const LABEL = /^[A-Z][\w &/+.-]{0,30}:\s/;
const MONTH = String.raw`(?:[A-Z][a-z]{2,8}\.?\s+)?`;
// "Apr 2023 – Present", "2019 - 2021", "Oct 2026" at the end of a line.
const DATE_AT_END = new RegExp(
  String.raw`\s+(${MONTH}\d{4}(?:\s*[–—-]\s*(?:${MONTH}\d{4}|Present|Current|Now))?)$`,
);

export function isHeading(line: string): boolean {
  const t = line.trim();
  if (KNOWN_HEADINGS.test(t)) return true;
  // At least 5 letters, so a wrapped "CSS" or "AWS" isn't a heading.
  return (
    t.length >= 5 &&
    t.length <= 40 &&
    /^[A-Z][A-Z &/,-]+$/.test(t) &&
    t.split(/\s+/).length <= 4
  );
}

/** Splits "Engineer, Acme Apr 2023 – Present" into the role and the date. */
export function splitDate(line: string): { text: string; date: string } | null {
  const t = line.trim();
  if (t.length > 160 || /[.!?]$/.test(t)) return null;
  const m = t.match(DATE_AT_END);
  if (!m || m.index === undefined || m.index < 3) return null;
  return { text: t.slice(0, m.index).replace(/[,\s]+$/, ""), date: m[1] };
}

/**
 * Text pulled out of a PDF keeps the PDF's line wraps and loses its bullet
 * marks. This joins wrapped lines back up, marks experience lines as
 * bullets and spaces out sections, so the person starts editing from
 * something that reads like a CV.
 */
export function tidyCv(raw: string): string {
  const out: string[] = [];
  let section = "";
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim().replace(/\s+/g, " ");
    if (!t) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (isHeading(t)) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(t);
      section = t;
      continue;
    }
    const prev = out[out.length - 1];
    // A line was wrapped if it's nearly full width or stops mid-list
    // ("…TypeScript," or "…github.com/jane |").
    const wrapped =
      prev &&
      (prev.length >= 80 || /[|,]$/.test(prev)) &&
      !isHeading(prev) &&
      !/[.!?]$/.test(prev) &&
      !splitDate(prev) &&
      !BULLET.test(t) &&
      !LABEL.test(t);
    if (wrapped) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
  }

  // Sentences under Experience, Projects and the like become bullets.
  section = "";
  const lines = out.map((line) => {
    if (isHeading(line)) {
      section = line;
      return line;
    }
    const bullet =
      section &&
      !NO_BULLETS_SECTION.test(section) &&
      line.length >= 40 &&
      /\.$/.test(line) &&
      !BULLET.test(line) &&
      !splitDate(line);
    return bullet ? `• ${line}` : line;
  });
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export type CvBlock =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "role"; text: string; date: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string }
  | { kind: "gap" };

/**
 * Reads the edited CV a line at a time for the PDF and Word files: the
 * first line is the name, lines before the first heading are contact
 * details, and "•" or "-" lines are bullets.
 */
export function cvBlocks(text: string): CvBlock[] {
  const blocks: CvBlock[] = [];
  let seenName = false;
  let seenHeading = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "gap")
        blocks.push({ kind: "gap" });
      continue;
    }
    if (!seenName) {
      blocks.push({ kind: "name", text: t });
      seenName = true;
      continue;
    }
    if (isHeading(t)) {
      blocks.push({ kind: "heading", text: t.toUpperCase() });
      seenHeading = true;
      continue;
    }
    if (!seenHeading) {
      blocks.push({ kind: "contact", text: t });
      continue;
    }
    if (BULLET.test(t)) {
      blocks.push({ kind: "bullet", text: t.replace(BULLET, "") });
      continue;
    }
    const role = splitDate(t);
    blocks.push(role ? { kind: "role", ...role } : { kind: "text", text: t });
  }
  // Headings already add space above, so a gap before one isn't needed.
  return blocks.filter(
    (b, i) =>
      b.kind !== "gap" ||
      (i < blocks.length - 1 && blocks[i + 1].kind !== "heading"),
  );
}
