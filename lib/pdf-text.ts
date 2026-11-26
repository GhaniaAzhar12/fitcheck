import type { PDFFont } from "pdf-lib";

// Text helpers for the standard PDF fonts, shared by the cover letter and
// the tailored CV.

/** Swaps characters the standard PDF font can't draw for close ASCII. */
export function drawable(text: string, font: PDFFont): string {
  const swaps: Record<string, string> = {
    " ": " ",
    "‐": "-",
    "‑": "-",
    "−": "-",
    "→": "->",
    "✓": "",
  };
  let out = "";
  for (const ch of text) {
    const swapped = swaps[ch] ?? ch;
    try {
      font.encodeText(swapped);
      out += swapped;
    } catch {
      // Not in the font's character set (e.g. emoji): leave it out.
    }
  }
  return out;
}

/** Word-wraps text to fit maxWidth points at the given font size. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** "Cover letter - Acme - Senior Engineer", safe for any file system. */
export function documentFileName(
  kind: string,
  company: string | null,
  jobTitle: string,
  ext: "pdf" | "docx",
): string {
  const base = [kind, company, jobTitle]
    .filter(Boolean)
    .join(" - ")
    .normalize("NFKD")
    .replace(/[^\w .-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90)
    .trim();
  return `${base || kind}.${ext}`;
}
