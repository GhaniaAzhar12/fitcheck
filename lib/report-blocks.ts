// Turns the fit report's light markdown (## headings, - bullets) into
// blocks React can render as plain elements: no HTML is injected.
// Works on partial text too, so it can render while the report streams.

export type Verdict = "apply" | "plan" | "skip";

export type ReportBlock =
  | { type: "verdict"; verdict: Verdict | null; label: string }
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "paragraph"; text: string };

const stripBold = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "");

export function verdictFrom(label: string): Verdict | null {
  const v = label.toLowerCase();
  if (v.startsWith("apply with")) return "plan";
  if (v.startsWith("apply")) return "apply";
  if (v.startsWith("skip")) return "skip";
  return null;
}

export function parseReport(text: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = stripBold(raw.trim());
    if (!line) continue;

    const heading = line.match(/^#{1,4}\s*(.+)$/);
    if (heading?.[1]) {
      const title = heading[1].trim();
      const verdict = title.match(/^verdict\s*:\s*(.*)$/i);
      blocks.push(
        verdict
          ? {
              type: "verdict",
              label: verdict[1]?.trim() ?? "",
              verdict: verdictFrom(verdict[1] ?? ""),
            }
          : { type: "heading", text: title },
      );
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet?.[1]) {
      blocks.push({ type: "bullet", text: bullet[1].trim() });
      continue;
    }
    blocks.push({ type: "paragraph", text: line });
  }
  return blocks;
}
