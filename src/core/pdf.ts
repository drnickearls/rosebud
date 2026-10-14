import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CoverPage, FormValues, PrintPart } from './types.js';

/** Where one value goes on the blank form, in PDF points (origin bottom-left). */
export interface TemplateField {
  key: keyof FormValues;
  x: number;
  y: number;
  size?: number;
  /** The text shrinks (to a floor of 6pt) until it fits this width. */
  maxWidth?: number;
  /** Printed in bold (for what must be read from across the room). */
  bold?: boolean;
}

/** The Form Template: field positions for one blank Routing Form artwork. */
export interface FormTemplate {
  name: string;
  font?: keyof typeof StandardFonts;
  fields: TemplateField[];
}

export interface FormAssets {
  blankPdf: Uint8Array;
  template: FormTemplate;
}

/** Characters the standard PDF fonts can't draw are replaced, so one odd name can't fail a whole print. */
function drawable(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function fit(text: string, font: PDFFont, size: number, maxWidth?: number): number {
  let s = size;
  if (maxWidth) while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

function drawForm(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, template: FormTemplate, values: FormValues): void {
  for (const f of template.fields) {
    const raw = values[f.key];
    if (!raw) continue;
    const font = f.bold ? fonts.bold : fonts.regular;
    const text = drawable(raw, font);
    page.drawText(text, { x: f.x, y: f.y, size: fit(text, font, f.size ?? 10, f.maxWidth), font, color: rgb(0, 0, 0) });
  }
}

const COVER_ROWS_PER_PAGE = 38;

function drawCover(doc: PDFDocument, fonts: { regular: PDFFont; bold: PDFFont }, cover: CoverPage, size: [number, number]): void {
  const total = cover.rows.length;
  const pages = Math.max(1, Math.ceil(total / COVER_ROWS_PER_PAGE));
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage(size);
    const top = size[1] - 60;
    const title = `${cover.provider} — ${total} ${total === 1 ? 'exam' : 'exams'}`;
    page.drawText(drawable(title, fonts.bold), { x: 54, y: top, size: 24, font: fonts.bold });
    page.drawText(drawable(cover.dateLabel + (pages > 1 ? `   (page ${p + 1} of ${pages})` : ''), fonts.regular), {
      x: 54,
      y: top - 24,
      size: 12,
      font: fonts.regular,
      color: rgb(0.3, 0.3, 0.3),
    });
    let y = top - 64;
    for (const row of cover.rows.slice(p * COVER_ROWS_PER_PAGE, (p + 1) * COVER_ROWS_PER_PAGE)) {
      page.drawText(drawable(row.time, fonts.regular), { x: 54, y, size: 11, font: fonts.regular });
      const name = drawable(row.name, fonts.bold);
      page.drawText(name, { x: 130, y, size: 11, font: fonts.bold });
      page.drawText(drawable(row.examType, fonts.regular), { x: 330, y, size: 11, font: fonts.regular });
      y -= 16.5;
    }
  }
}

/**
 * The whole print: cover pages and filled Routing Forms, in the order given. `onForm` is
 * awaited after each form is drawn (done so far, total), so a screen can show progress.
 */
export async function buildPdf(
  parts: PrintPart[],
  assets: FormAssets,
  onForm?: (done: number, total: number) => void | Promise<void>,
): Promise<Uint8Array> {
  const total = parts.filter((p) => p.kind === 'form').length;
  let done = 0;
  const out = await PDFDocument.create();
  const blank = await PDFDocument.load(assets.blankPdf);
  const font = await out.embedFont(StandardFonts[assets.template.font ?? 'Helvetica']);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const size = blank.getPage(0).getSize();

  for (const part of parts) {
    if (part.kind === 'cover') {
      drawCover(out, { regular: font, bold }, part.cover, [size.width, size.height]);
    } else {
      const [page] = await out.copyPages(blank, [0]);
      out.addPage(page!);
      drawForm(page!, { regular: font, bold }, assets.template, part.values);
      await onForm?.(++done, total);
    }
  }
  return out.save();
}
