import { PDFDocument } from 'pdf-lib';
import type { FormAssets, FormTemplate, TemplateField } from './pdf.js';
import type { FormValues } from './types.js';

/** Every value Rosebud can print, in the order the settings page lists them (CONTEXT.md, "Pre-filled Field"). */
export const FIELD_KEYS = [
  'provider',
  'date',
  'appointmentTime',
  'name',
  'dob',
  'age',
  'patientId',
  'balanceDue',
  'reasonForVisit',
] as const satisfies readonly (keyof FormValues)[];

export const FIELD_LABELS: Record<keyof FormValues, string> = {
  provider: 'Provider',
  date: 'Date',
  appointmentTime: 'Appointment Time',
  name: 'Name',
  dob: 'D.O.B.',
  age: 'Age',
  patientId: 'ID #',
  balanceDue: 'Balance due',
  reasonForVisit: 'Reason For Visit',
};

/** Made-up values for a test print, longer than usual so a field that is too small shows up. */
export const SAMPLE_VALUES: FormValues = {
  provider: 'Albus Dumbledore',
  date: '10/13/2026',
  appointmentTime: '10:40 AM',
  name: 'Harry Potter',
  dob: '07/31/1980',
  age: '46',
  patientId: '117820477',
  balanceDue: '1387.50',
  reasonForVisit: 'Cataract Post Op Exam — 1 month post op, blurry vision in left eye',
};

export const MAX_PDF_BYTES = 3 * 1024 * 1024;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Checks a Form Template read from a file; the error says what is wrong in plain words. */
export function validateTemplate(raw: unknown): FormTemplate {
  if (typeof raw !== 'object' || raw === null) throw new Error('The form file has no template in it.');
  const t = raw as { name?: unknown; fields?: unknown };
  if (!Array.isArray(t.fields) || t.fields.length === 0) throw new Error('The template lists no fields.');
  const seen = new Set<string>();
  // Forms saved before the birth date became one field (month / day / year pieces): keep the
  // month's position for the whole date and drop the other two.
  const entries = (t.fields as Partial<Record<string, unknown>>[])
    .filter((f) => f?.key !== 'dobDay' && f?.key !== 'dobYear')
    .map((f) => (f?.key === 'dobMonth' ? { maxWidth: 62, ...f, key: 'dob' } : f));
  const fields: TemplateField[] = entries.map((entry: unknown, i: number) => {
    const f = entry as Partial<Record<string, unknown>>;
    const key = f?.key;
    if (typeof key !== 'string' || !(FIELD_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Field ${i + 1} is "${String(key)}", which Rosebud can't fill. It can fill: ${FIELD_KEYS.join(', ')}.`);
    }
    if (seen.has(key)) throw new Error(`The field "${key}" appears twice.`);
    seen.add(key);
    if (!isNumber(f.x) || !isNumber(f.y)) throw new Error(`The field "${key}" needs a number for x and for y.`);
    if (f.size !== undefined && (!isNumber(f.size) || f.size <= 0)) throw new Error(`The size of "${key}" must be a number above 0.`);
    if (f.maxWidth !== undefined && (!isNumber(f.maxWidth) || f.maxWidth <= 0)) throw new Error(`The maximum width of "${key}" must be a number above 0.`);
    if (f.bold !== undefined && typeof f.bold !== 'boolean') throw new Error(`The bold setting of "${key}" must be true or false.`);
    const field: TemplateField = { key: key as keyof FormValues, x: f.x, y: f.y };
    if (f.bold) field.bold = true;
    if (f.size !== undefined) field.size = f.size as number;
    if (f.maxWidth !== undefined) field.maxWidth = f.maxWidth as number;
    return field;
  });
  return { name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Imported form', font: 'Helvetica', fields };
}

/** Reads a blank PDF: it must open, and Rosebud uses its first page. */
export async function inspectBlankPdf(bytes: Uint8Array): Promise<{ pages: number; width: number; height: number }> {
  if (bytes.length > MAX_PDF_BYTES) throw new Error(`That PDF is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    throw new Error("That file isn't a PDF Rosebud can open.");
  }
  const size = doc.getPage(0).getSize();
  return { pages: doc.getPageCount(), width: Math.round(size.width), height: Math.round(size.height) };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A form as one file: the blank PDF and its field positions, for moving to another computer. */
interface FormPackage {
  format: 'rosebud-form';
  version: 1;
  template: FormTemplate;
  blankPdf: string; // base64
}

export function stringifyPackage(assets: FormAssets): string {
  const pack: FormPackage = { format: 'rosebud-form', version: 1, template: assets.template, blankPdf: toBase64(assets.blankPdf) };
  return JSON.stringify(pack);
}

export async function parsePackage(text: string): Promise<FormAssets> {
  let raw: Partial<FormPackage>;
  try {
    raw = JSON.parse(text) as Partial<FormPackage>;
  } catch {
    throw new Error("That file isn't a Rosebud form file.");
  }
  if (raw.format !== 'rosebud-form' || raw.version !== 1 || typeof raw.blankPdf !== 'string') throw new Error("That file isn't a Rosebud form file.");
  const template = validateTemplate(raw.template);
  const blankPdf = fromBase64(raw.blankPdf);
  await inspectBlankPdf(blankPdf);
  return { template, blankPdf };
}
