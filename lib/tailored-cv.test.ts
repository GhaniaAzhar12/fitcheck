import { describe, expect, test } from "bun:test";

import { extractText, getDocumentProxy } from "unpdf";

import { cvBlocks, isHeading, splitDate, tidyCv } from "./cv-text";
import { cvFileName, tailoredCvDocx, tailoredCvPdf } from "./tailored-cv";

// Shaped like text pulled out of a real PDF CV: hard line wraps, no bullets.
const RAW = [
  "JANE DOE",
  "Software Engineer",
  "London, UK | jane@example.com | github.com/janedoe |",
  "janedoe.dev",
  "SUMMARY",
  "Engineer with 4 years of experience building web applications with React, Next.js and TypeScript for",
  "fintech teams. Known for fast, accessible interfaces.",
  "SKILLS",
  "Frontend: React, Next.js, TypeScript, JavaScript, Redux, React Hooks, HTML5, CSS3, SCSS, Tailwind",
  "CSS",
  "Backend: Node.js, PostgreSQL",
  "EXPERIENCE",
  "Software Engineer, Acme, London Apr 2022 – Present",
  "Led a 4-person team to rebuild the checkout flow in Next.js, cutting drop-off by 18% across web and",
  "mobile.",
  "Reduced bundle size by 40% with route-level code splitting.",
  "EDUCATION",
  "BSc Computer Science, UCL 2018 – 2021",
].join("\n");

describe("tidyCv", () => {
  const tidy = tidyCv(RAW);

  test("joins lines the PDF wrapped", () => {
    expect(tidy).toContain(
      "React, Next.js and TypeScript for fintech teams. Known",
    );
    expect(tidy).toContain("SCSS, Tailwind CSS");
    expect(tidy).toContain("github.com/janedoe | janedoe.dev");
  });

  test("keeps label lines, roles and headings on their own lines", () => {
    expect(tidy).toContain("\nBackend: Node.js, PostgreSQL\n");
    expect(tidy).toContain(
      "\nSoftware Engineer, Acme, London Apr 2022 – Present\n",
    );
    expect(tidy).toContain("\n\nEXPERIENCE\n");
  });

  test("marks experience sentences as bullets, but not the summary", () => {
    expect(tidy).toContain(
      "• Led a 4-person team to rebuild the checkout flow in Next.js, cutting drop-off by 18% across web and mobile.",
    );
    expect(tidy).toContain("• Reduced bundle size by 40%");
    expect(tidy).not.toContain("• Engineer with");
  });

  test("running it twice changes nothing", () => {
    expect(tidyCv(tidy)).toBe(tidy);
  });
});

describe("cv-text helpers", () => {
  test("isHeading skips short acronyms", () => {
    expect(isHeading("EXPERIENCE")).toBe(true);
    expect(isHeading("Work Experience")).toBe(true);
    expect(isHeading("CSS")).toBe(false);
    expect(isHeading("Led the team")).toBe(false);
  });

  test("splitDate finds dates at the end of role lines only", () => {
    expect(splitDate("Engineer, Acme Apr 2022 – Present")).toEqual({
      text: "Engineer, Acme",
      date: "Apr 2022 – Present",
    });
    expect(splitDate("Meta React Specialization, Coursera, Apr 2026")).toEqual({
      text: "Meta React Specialization, Coursera",
      date: "Apr 2026",
    });
    expect(splitDate("Shipped the app in 2024.")).toBeNull();
  });

  test("cvBlocks reads name, contact, headings, roles and bullets", () => {
    const kinds = cvBlocks(tidyCv(RAW)).map((b) => b.kind);
    expect(kinds.slice(0, 4)).toEqual([
      "name",
      "contact",
      "contact",
      "heading",
    ]);
    expect(kinds).toContain("role");
    expect(kinds).toContain("bullet");
    // No blank-line gap right before a heading.
    expect(kinds.join(" ")).not.toContain("gap heading");
  });
});

describe("downloads", () => {
  const edited = `${tidyCv(RAW)}\n• Added: built a design system → used by 3 teams ✓`;

  test("PDF has the edited text, with characters the font can't draw swapped", async () => {
    const bytes = await tailoredCvPdf(edited);
    const { text } = await extractText(await getDocumentProxy(bytes), {
      mergePages: true,
    });
    expect(text).toContain("JANE DOE");
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Apr 2022 – Present");
    expect(text).toContain("design system -> used by 3 teams");
  });

  test("a long CV runs onto more pages", async () => {
    const long = `${edited}\n${"• Built and shipped another feature for a client team.\n".repeat(80)}`;
    const pdf = await getDocumentProxy(await tailoredCvPdf(long));
    expect(pdf.numPages).toBeGreaterThan(1);
  });

  test("Word file has the edited text and real bullets", async () => {
    const buffer = await tailoredCvDocx(edited);
    const { strFromU8, unzipSync } = await import("fflate");
    const xml = strFromU8(
      unzipSync(new Uint8Array(buffer))["word/document.xml"],
    );
    expect(xml).toContain("JANE DOE");
    expect(xml).toContain("Reduced bundle size by 40%");
    expect(xml).toContain("w:numPr"); // a list, not a typed "•"
    expect(xml).not.toContain("• Reduced");
  });

  test("file names", () => {
    expect(cvFileName("Acme / Ltd", "Senior Engineer", "pdf")).toBe(
      "CV - Acme Ltd - Senior Engineer.pdf",
    );
    expect(cvFileName(null, "Engineer", "docx")).toBe("CV - Engineer.docx");
  });
});
