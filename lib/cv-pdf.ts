import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

/** Vercel rejects request bodies over 4.5 MB, so stay under it. */
export const MAX_CV_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_CHARS = 30_000;
/** Less than this usually means a scanned (image-only) PDF. */
const MIN_CHARS = 200;

/** A message that is safe to show the user as-is. */
export class CvError extends Error {}

export type CvText = { text: string; pages: number; fileName: string };

export async function readCvPdf(file: File): Promise<CvText> {
  if (file.size === 0) throw new CvError("Choose a PDF file first.");
  if (file.size > MAX_CV_BYTES) {
    throw new CvError(
      "That file is over 4 MB. Export a smaller PDF and try again.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the file's first bytes, not just its name: real PDFs start with "%PDF-".
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new CvError("That isn't a PDF. Export your CV as PDF and try again.");
  }

  let pages: number;
  let raw: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > MAX_PAGES) {
      throw new CvError(
        `Your CV has ${pdf.numPages} pages. Upload one with ${MAX_PAGES} pages or fewer.`,
      );
    }
    const result = await extractText(pdf, { mergePages: true });
    pages = result.totalPages;
    raw = result.text;
  } catch (error) {
    if (error instanceof CvError) throw error;
    if (error instanceof Error && error.name === "PasswordException") {
      throw new CvError(
        "That PDF is password-protected. Remove the password and try again.",
      );
    }
    throw new CvError("We couldn't read that PDF. Try exporting it again.");
  }

  const text = clean(raw);
  if (text.length < MIN_CHARS) {
    throw new CvError(
      "We couldn't find text in that PDF. It may be a scanned image: export your CV from Word or Google Docs instead.",
    );
  }

  return {
    text: text.slice(0, MAX_CHARS),
    pages,
    fileName: safeFileName(file.name),
  };
}

function clean(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "cv.pdf";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "cv.pdf";
}
