import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FormValues, PrintPart } from './types.js';

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

/**
 * The text size a field prints at: its size, shrunk in half-points (to a floor of 6pt) until
 * the text fits its maximum width. The settings page previews with the same rule and metrics.
 */
export function fitSize(text: string, size: number, maxWidth: number | undefined, widthAt: (text: string, size: number) => number): number {
  let s = size;
  if (maxWidth) while (s > 6 && widthAt(text, s) > maxWidth) s -= 0.5;
  return s;
}

function drawForm(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, template: FormTemplate, values: FormValues): void {
  for (const f of template.fields) {
    const raw = values[f.key];
    if (!raw) continue;
    const font = f.bold ? fonts.bold : fonts.regular;
    const text = drawable(raw, font);
    page.drawText(text, { x: f.x, y: f.y, size: fitSize(text, f.size ?? 10, f.maxWidth, (t, s) => font.widthOfTextAtSize(t, s)), font, color: rgb(0, 0, 0) });
  }
}

/**
 * The whole print: filled Routing Forms, in the order given. `onForm` is
 * awaited after each form is drawn (done so far, total), so a screen can show progress.
 */
export async function buildPdf(
  parts: PrintPart[],
  assets: FormAssets,
  onForm?: (done: number, total: number) => void | Promise<void>,
): Promise<Uint8Array> {
  const total = parts.length;
  let done = 0;
  const out = await PDFDocument.create();
  const blank = await PDFDocument.load(assets.blankPdf);
  const font = await out.embedFont(StandardFonts[assets.template.font ?? 'Helvetica']);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  for (const part of parts) {
    const [page] = await out.copyPages(blank, [0]);
    out.addPage(page!);
    drawForm(page!, { regular: font, bold }, assets.template, part.values);
    await onForm?.(++done, total);
  }
  return out.save();
}
