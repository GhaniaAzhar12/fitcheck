import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";

import { documentFileName, drawable, wrapText } from "./pdf-text";

// Turns the saved cover note into a letter people can download as PDF or
// Word. The note itself is only the body; this adds the sender, date,
// recipient, greeting and sign-off around it, unless the note already has them.

export type CoverLetterInput = {
  /** The account name (often a GitHub login). */
  userName: string;
  email: string | null;
  /** The CV text, used to find a real name when the account name is a login. */
  cvText: string;
  company: string | null;
  jobTitle: string;
  body: string;
  date: Date;
};

export type LetterParts = {
  name: string;
  email: string | null;
  date: string;
  subject: string;
  greeting: string | null;
  paragraphs: string[];
  closing: string | null;
  signature: string | null;
};

const GREETING = /^\s*(dear|hi|hello|to whom)\b/i;
// A sign-off on its own line near the end, optionally followed by a name.
const SIGN_OFF =
  /(^|\n)\s*(kind regards|best regards|regards|sincerely|yours sincerely|best wishes|best|thank you|thanks|cheers)[,.!]?\s*(\n[^\n]{0,60})?\s*$/i;

/**
 * The name to sign with. A GitHub login like "jdoe42" reads badly on a
 * letter, so prefer the CV's first line when it looks like a person's name.
 */
export function signerName(userName: string, cvText: string): string {
  const account = userName.trim();
  if (/\s/.test(account)) return account;
  const firstLine = cvText
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (firstLine) {
    const words = firstLine.split(/\s+/);
    const looksLikeName =
      words.length >= 2 &&
      words.length <= 4 &&
      words.every((w) => /^[\p{L}][\p{L}'.-]*$/u.test(w));
    if (looksLikeName) return titleCaseIfShouting(firstLine);
  }
  return account;
}

/** CVs often put the name in capitals: "JANE O'NEIL-SMITH" → "Jane O'Neil-Smith". */
function titleCaseIfShouting(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * A model often writes the note as one long block. Split a single long
 * paragraph into about three at sentence breaks so it reads like a letter.
 */
function intoParagraphs(paragraphs: string[]): string[] {
  if (paragraphs.length !== 1 || paragraphs[0].length < 600) return paragraphs;
  // A break needs ". " followed by a capital, so "Next.js for" stays whole.
  const sentences = paragraphs[0].split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (sentences.length < 4) return paragraphs;
  const groups = 3;
  const size = Math.ceil(sentences.length / groups);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += size) {
    out.push(sentences.slice(i, i + size).join(" "));
  }
  return out;
}

export function letterParts(input: CoverLetterInput): LetterParts {
  const body = input.body.replace(/\r\n/g, "\n").trim();
  const name = signerName(input.userName, input.cvText);
  const paragraphs = intoParagraphs(
    body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean),
  );
  const hasGreeting = GREETING.test(body);
  const hasSignOff = SIGN_OFF.test(body);
  return {
    name,
    email: input.email,
    date: input.date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    subject: input.company
      ? `${input.jobTitle} at ${input.company}`
      : input.jobTitle,
    greeting: hasGreeting
      ? null
      : input.company
        ? `Dear ${input.company} hiring team,`
        : "Dear hiring team,",
    paragraphs,
    closing: hasSignOff ? null : "Kind regards,",
    signature: hasSignOff ? null : name,
  };
}

export function coverLetterFileName(
  company: string | null,
  jobTitle: string,
  ext: "pdf" | "docx",
): string {
  return documentFileName("Cover letter", company, jobTitle, ext);
}

// ---------- PDF ----------

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 72;
const SIZE = 11;
const LEADING = 16;

const wrap = (text: string, font: PDFFont, maxWidth: number) =>
  wrapText(text, font, SIZE, maxWidth);

export async function coverLetterPdf(parts: LetterParts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cover letter: ${parts.subject}`);
  pdf.setAuthor(parts.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE.width - MARGIN * 2;

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const write = (text: string, font: PDFFont = regular) => {
    for (const line of wrap(drawable(text, font), font, maxWidth)) {
      if (y < MARGIN) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: SIZE, font });
      y -= LEADING;
    }
  };
  const gap = (lines = 1) => {
    y -= LEADING * lines;
  };

  write(parts.name, bold);
  if (parts.email) write(parts.email);
  gap();
  write(parts.date);
  gap();
  write(`Re: ${parts.subject}`, bold);
  gap();
  if (parts.greeting) {
    write(parts.greeting);
    gap(0.5);
  }
  for (const paragraph of parts.paragraphs) {
    write(paragraph);
    gap(0.5);
  }
  if (parts.closing) {
    gap(0.5);
    write(parts.closing);
    if (parts.signature) write(parts.signature);
  }

  return pdf.save();
}

// ---------- Word ----------

export async function coverLetterDocx(parts: LetterParts): Promise<Buffer> {
  const para = (text: string, opts: { bold?: boolean; after?: number } = {}) =>
    new Paragraph({
      spacing: { after: opts.after ?? 200 },
      children: [new TextRun({ text, bold: opts.bold })],
    });

  const children = [
    para(parts.name, { bold: true, after: 0 }),
    ...(parts.email ? [para(parts.email, { after: 0 })] : []),
    new Paragraph({ children: [] }),
    para(parts.date),
    para(`Re: ${parts.subject}`, { bold: true }),
    ...(parts.greeting ? [para(parts.greeting)] : []),
    ...parts.paragraphs.map((p) => para(p)),
    ...(parts.closing
      ? [
          para(parts.closing, { after: 0 }),
          ...(parts.signature ? [para(parts.signature)] : []),
        ]
      : []),
  ];

  const doc = new Document({
    creator: parts.name,
    title: `Cover letter: ${parts.subject}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
