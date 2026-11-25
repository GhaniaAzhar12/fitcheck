import { describe, expect, test } from "bun:test";

import { extractText, getDocumentProxy } from "unpdf";

import {
  type CoverLetterInput,
  coverLetterDocx,
  coverLetterFileName,
  coverLetterPdf,
  letterParts,
  signerName,
} from "./cover-letter";

const input: CoverLetterInput = {
  userName: "Ada Lovelace",
  email: "ada@example.com",
  cvText: "Ada Lovelace\nSoftware engineer",
  company: "Acme",
  jobTitle: "Full Stack Engineer",
  body: "I build web apps with Next.js.\n\nI led a team of six.",
  date: new Date("2026-11-25T10:00:00Z"),
};

describe("signerName", () => {
  test("keeps an account name that is already a full name", () => {
    expect(signerName("Ada Lovelace", "")).toBe("Ada Lovelace");
  });

  test("uses the CV's first line when the account name is a login", () => {
    expect(signerName("ada42", "\n  Ada Lovelace \nEngineer")).toBe(
      "Ada Lovelace",
    );
  });

  test("writes a name in capitals the normal way", () => {
    expect(signerName("ada42", "ADA LOVELACE\nEngineer")).toBe("Ada Lovelace");
    expect(signerName("jo", "JANE O'NEIL-SMITH")).toBe("Jane O'Neil-Smith");
    expect(signerName("jo", "Jane McDonald")).toBe("Jane McDonald");
  });

  test("falls back to the login when the CV doesn't start with a name", () => {
    expect(signerName("ada42", "Senior engineer with 5+ years")).toBe("ada42");
    expect(signerName("ada42", "Curriculum Vitae 2026")).toBe("ada42");
    expect(signerName("ada42", "")).toBe("ada42");
  });
});

describe("letterParts", () => {
  test("wraps the note in a greeting and sign-off", () => {
    const parts = letterParts(input);
    expect(parts.date).toBe("25 November 2026");
    expect(parts.subject).toBe("Full Stack Engineer at Acme");
    expect(parts.greeting).toBe("Dear Acme hiring team,");
    expect(parts.paragraphs).toEqual([
      "I build web apps with Next.js.",
      "I led a team of six.",
    ]);
    expect(parts.closing).toBe("Kind regards,");
    expect(parts.signature).toBe("Ada Lovelace");
  });

  test("doesn't add a greeting or sign-off the note already has", () => {
    const parts = letterParts({
      ...input,
      body: "Dear team,\n\nI build things.\n\nKind regards,\nAda",
    });
    expect(parts.greeting).toBeNull();
    expect(parts.closing).toBeNull();
    expect(parts.signature).toBeNull();
  });

  test("a sentence ending in 'best' isn't a sign-off", () => {
    const parts = letterParts({ ...input, body: "I always do my best." });
    expect(parts.closing).toBe("Kind regards,");
  });

  test("joins lines wrapped inside a paragraph", () => {
    const parts = letterParts({ ...input, body: "One line\nthat wraps." });
    expect(parts.paragraphs).toEqual(["One line that wraps."]);
  });

  test("splits one long block into paragraphs at sentence breaks", () => {
    const sentence =
      "I built a logistics platform with Next.js for server-side rendering and REST APIs.";
    const body = Array.from({ length: 9 }, () => sentence).join(" ");
    const parts = letterParts({ ...input, body });
    expect(parts.paragraphs).toHaveLength(3);
    expect(parts.paragraphs.join(" ")).toBe(body);
    // "Next.js for" isn't a sentence break.
    for (const p of parts.paragraphs) expect(p).toContain("Next.js for");
  });

  test("leaves short notes and notes with paragraphs alone", () => {
    expect(
      letterParts({ ...input, body: "Short. Note. Here. Ok." }).paragraphs,
    ).toHaveLength(1);
    expect(letterParts(input).paragraphs).toHaveLength(2);
  });

  test("works without a company", () => {
    const parts = letterParts({ ...input, company: null });
    expect(parts.subject).toBe("Full Stack Engineer");
    expect(parts.greeting).toBe("Dear hiring team,");
  });
});

describe("coverLetterFileName", () => {
  test("names the file after the company and role", () => {
    expect(coverLetterFileName("Acme", "Full Stack Engineer", "pdf")).toBe(
      "Cover letter - Acme - Full Stack Engineer.pdf",
    );
  });

  test("drops characters that break file names or headers", () => {
    expect(coverLetterFileName('Lé "Co"/Inc', "Dev (React)", "docx")).toBe(
      "Cover letter - Le CoInc - Dev React.docx",
    );
  });
});

describe("coverLetterPdf", () => {
  test("writes a PDF with the whole letter in it", async () => {
    const bytes = await coverLetterPdf(letterParts(input));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { text } = await extractText(await getDocumentProxy(bytes), {
      mergePages: true,
    });
    for (const part of [
      "Ada Lovelace",
      "25 November 2026",
      "Re: Full Stack Engineer at Acme",
      "Dear Acme hiring team,",
      "I led a team of six.",
      "Kind regards,",
    ]) {
      expect(text).toContain(part);
    }
  });

  test("survives characters the PDF font can't draw, and long notes", async () => {
    const long = Array.from(
      { length: 120 },
      () => "I ship features – fast → and well 🚀.",
    ).join(" ");
    const bytes = await coverLetterPdf(letterParts({ ...input, body: long }));
    const pdf = await getDocumentProxy(bytes);
    expect(pdf.numPages).toBeGreaterThan(1);
    const { text } = await extractText(pdf, { mergePages: true });
    expect(text).toContain("I ship features – fast -> and well .");
  });
});

describe("coverLetterDocx", () => {
  test("writes a Word file with the letter text", async () => {
    const buffer = await coverLetterDocx(letterParts(input));
    // A .docx is a zip; its text lives in word/document.xml.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    // fflate is what docx itself zips with, so it's always installed.
    const { strFromU8, unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(buffer));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Dear Acme hiring team,");
    expect(xml).toContain("I led a team of six.");
    expect(xml).toContain("Kind regards,");
  });
});
