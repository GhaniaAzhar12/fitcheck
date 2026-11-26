import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

import { type CvBlock, cvBlocks } from "./cv-text";
import { documentFileName, drawable, wrapText } from "./pdf-text";

// Turns the person's edited CV (plain text) into a PDF or Word file with a
// simple one-column layout: name, contact line, section headings with a
// rule, roles with the date on the right, and bullets.

export function cvFileName(
  company: string | null,
  jobTitle: string,
  ext: "pdf" | "docx",
): string {
  return documentFileName("CV", company, jobTitle, ext);
}

function nameOf(blocks: CvBlock[]): string {
  const name = blocks.find((b) => b.kind === "name");
  return name && "text" in name ? name.text : "CV";
}

// ---------- PDF ----------

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = 50;
const BODY = 10;
const LEADING = 13.5;
const GREY = rgb(0.35, 0.35, 0.35);

export async function tailoredCvPdf(text: string): Promise<Uint8Array> {
  const blocks = cvBlocks(text);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`CV: ${nameOf(blocks)}`);
  pdf.setAuthor(nameOf(blocks));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - MARGIN * 2;

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const room = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };
  const lines = (
    value: string,
    {
      font = regular,
      size = BODY,
      indent = 0,
      maxWidth = width - indent,
      color = rgb(0, 0, 0),
      leading = LEADING,
    }: {
      font?: PDFFont;
      size?: number;
      indent?: number;
      maxWidth?: number;
      color?: ReturnType<typeof rgb>;
      leading?: number;
    } = {},
  ) => {
    for (const line of wrapText(drawable(value, font), font, size, maxWidth)) {
      room(leading);
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= leading;
    }
  };

  for (const block of blocks) {
    switch (block.kind) {
      case "name":
        lines(block.text, { font: bold, size: 18, leading: 24 });
        break;
      case "contact":
        lines(block.text, { size: 9.5, color: GREY, leading: 13 });
        break;
      case "heading":
        y -= 8;
        room(LEADING * 3);
        lines(block.text, { font: bold, size: 11, leading: 5 });
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: MARGIN + width, y },
          thickness: 0.6,
          color: GREY,
        });
        y -= 13;
        break;
      case "role": {
        const date = drawable(block.date, regular);
        const dateWidth = regular.widthOfTextAtSize(date, BODY);
        room(LEADING * 2);
        y -= 2;
        page.drawText(date, {
          x: MARGIN + width - dateWidth,
          y,
          size: BODY,
          font: regular,
          color: GREY,
        });
        lines(block.text, { font: bold, maxWidth: width - dateWidth - 12 });
        break;
      }
      case "bullet": {
        const indent = 12;
        const wrapped = wrapText(
          drawable(block.text, regular),
          regular,
          BODY,
          width - indent,
        );
        room(LEADING);
        page.drawText("•", { x: MARGIN + 2, y, size: BODY, font: regular });
        for (const line of wrapped) {
          room(LEADING);
          page.drawText(line, {
            x: MARGIN + indent,
            y,
            size: BODY,
            font: regular,
          });
          y -= LEADING;
        }
        break;
      }
      case "text":
        lines(block.text);
        break;
      case "gap":
        y -= LEADING / 2;
        break;
    }
  }

  return pdf.save();
}

// ---------- Word ----------

export async function tailoredCvDocx(text: string): Promise<Buffer> {
  const blocks = cvBlocks(text);
  const children: Paragraph[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "name":
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: block.text, bold: true, size: 36 })],
          }),
        );
        break;
      case "contact":
        children.push(
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: block.text, size: 19, color: "595959" }),
            ],
          }),
        );
        break;
      case "heading":
        children.push(
          new Paragraph({
            spacing: { before: 240, after: 100 },
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 6,
                color: "808080",
                space: 2,
              },
            },
            children: [new TextRun({ text: block.text, bold: true })],
          }),
        );
        break;
      case "role":
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            // A4 width (11906) less the two 1000 margins, in twips.
            tabStops: [{ type: TabStopType.RIGHT, position: 9906 }],
            children: [
              new TextRun({ text: block.text, bold: true }),
              new TextRun({ text: `\t${block.date}`, color: "595959" }),
            ],
          }),
        );
        break;
      case "bullet":
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: [new TextRun(block.text)],
          }),
        );
        break;
      case "text":
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            alignment: AlignmentType.LEFT,
            children: [new TextRun(block.text)],
          }),
        );
        break;
      case "gap":
        children.push(new Paragraph({ spacing: { after: 0 }, children: [] }));
        break;
    }
  }

  const doc = new Document({
    creator: nameOf(blocks),
    title: `CV: ${nameOf(blocks)}`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21 } } },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
