import * as pdfjs from 'pdfjs-dist';
import { chromeApi } from '../platform/chrome.js';
import type { FormValues } from '../core/types.js';

pdfjs.GlobalWorkerOptions.workerSrc = chromeApi.runtime.getURL('pdf.worker.min.mjs');

/** One page of a blank form, ready to draw and to read label positions from. */
export interface FormPage {
  /** Page size in PDF points. */
  width: number;
  height: number;
  draw(canvas: HTMLCanvasElement, scale: number): Promise<void>;
  /** Where each label sits, to suggest first positions on a new form. */
  suggest(): Promise<Partial<Record<keyof FormValues, { x: number; y: number }>>>;
  destroy(): void;
}

export async function openFormPage(bytes: Uint8Array): Promise<FormPage> {
  // Errors only: pdf.js warns about harmless font quirks (e.g. "TT: undefined function"),
  // which Edge lists under the extension's Errors button.
  const loading = pdfjs.getDocument({ data: bytes.slice(), verbosity: pdfjs.VerbosityLevel.ERRORS });
  const doc = await loading.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  return {
    width: base.width,
    height: base.height,
    async draw(canvas, scale) {
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${base.width * scale}px`;
      canvas.style.height = `${base.height * scale}px`;
      await page.render({ canvas, viewport }).promise;
    },
    async suggest() {
      const items = (await page.getTextContent()).items.filter((i): i is typeof i & { str: string; transform: number[]; height: number } => 'str' in i);
      const ctx = document.createElement('canvas').getContext('2d')!;
      return suggestPositions(
        items.map((i) => ({ text: i.str, x: i.transform[4] ?? 0, y: i.transform[5] ?? 0, size: i.height || 11 })),
        (text, size) => {
          ctx.font = `${size}px Calibri, Carlito, Arial, sans-serif`;
          return ctx.measureText(text).width;
        },
      );
    },
    destroy() {
      void loading.destroy();
    },
  };
}

export interface LabelItem {
  text: string;
  x: number;
  y: number;
  size: number;
}

/**
 * First-guess positions from the form's own labels ("Date:", "Name", "D.O.B." ...): the
 * blank starts just after the label text (the part before the first underscore). It is a
 * starting point to drag from, not an answer.
 */
export function suggestPositions(
  items: LabelItem[],
  measure: (text: string, size: number) => number,
): Partial<Record<keyof FormValues, { x: number; y: number }>> {
  const labels: [keyof FormValues, RegExp][] = [
    ['date', /^\s*Date\s*:/i],
    ['appointmentTime', /^\s*Appointment Time/i],
    ['name', /^\s*Name\b/i],
    ['dob', /^\s*D\.?O\.?B/i],
    ['age', /^\s*Age\b/i],
    ['patientId', /^\s*ID\s*#/i],
    ['balanceDue', /Balance due/i],
    ['reasonForVisit', /Reason For Visit/i],
  ];
  const found: Partial<Record<keyof FormValues, { x: number; y: number }>> = {};
  for (const [key, pattern] of labels) {
    const item = items.find((i) => pattern.test(i.text));
    if (!item) continue;
    const underscore = item.text.indexOf('_');
    const label = underscore >= 0 ? item.text.slice(0, underscore) : item.text;
    found[key] = { x: Math.round((item.x + measure(label, item.size) + 3) * 2) / 2, y: Math.round((item.y + 2) * 2) / 2 };
  }
  return found;
}
