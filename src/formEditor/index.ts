/**
 * The form editor behind the settings page (CONTEXT.md, "Form Settings"), with no screen code:
 * a Draft goes in, edits return a new Draft, and finished assets come out. The settings page
 * (src/options/App.tsx) is a view over it.
 *
 * Two coordinate systems meet here. Positions are kept in PDF points with the origin at the
 * BOTTOM-left of the page and y pointing up (where pdf-lib draws the text's baseline); the
 * screen has its origin at the TOP-left with y pointing down, `scale` pixels per point.
 */

import { StandardFontEmbedder, StandardFonts } from 'pdf-lib';
import { FIELD_KEYS, SAMPLE_VALUES, validateTemplate } from '../core/form.js';
import { fitSize, type FormAssets, type TemplateField } from '../core/pdf.js';
import type { FormValues } from '../core/types.js';

export type Key = keyof FormValues;

/** One field on the form being edited. */
export interface Placed {
  x: number;
  y: number;
  size: number;
  maxWidth?: number;
  bold?: boolean;
}

export interface Draft {
  name: string;
  blankPdf: Uint8Array;
  fields: Partial<Record<Key, Placed>>;
}

export interface PageSize {
  width: number;
  height: number;
}

/** Positions snap to half a point. */
export const SNAP = 0.5;
/** Arrow keys move a box by SNAP, or by this with Shift. */
export const BIG_STEP = 5;
const MIN_SIZE = 6;
const MAX_SIZE = 24;
const MIN_WIDTH = 8;
/** A box can't be dragged closer than this to the page's right or top edge. */
const EDGE = 5;

const snap = (n: number) => Math.round(n / SNAP) * SNAP;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function draftOf(assets: FormAssets): Draft {
  const fields: Draft['fields'] = {};
  for (const f of assets.template.fields) {
    const placed: Placed = { x: f.x, y: f.y, size: f.size ?? 10 };
    if (f.maxWidth !== undefined) placed.maxWidth = f.maxWidth;
    if (f.bold) placed.bold = true;
    fields[f.key] = placed;
  }
  return { name: assets.template.name, blankPdf: assets.blankPdf, fields };
}

/** The draft as a Form Template + blank PDF, checked the same way a loaded form file is. */
export function assetsOf(draft: Draft): FormAssets {
  const fields: TemplateField[] = FIELD_KEYS.flatMap((key) => {
    const p = draft.fields[key];
    if (!p) return [];
    const f: TemplateField = { key, x: p.x, y: p.y, size: p.size };
    if (p.maxWidth !== undefined) f.maxWidth = p.maxWidth;
    if (p.bold) f.bold = true;
    return [f];
  });
  return { blankPdf: draft.blankPdf, template: validateTemplate({ name: draft.name, fields }) };
}

/** Fields not on the form, in the settings page's order. */
export const unplaced = (draft: Draft): Key[] => FIELD_KEYS.filter((k) => !draft.fields[k]);

function update(draft: Draft, key: Key, change: (field: Placed) => Placed): Draft {
  const field = draft.fields[key];
  return field ? { ...draft, fields: { ...draft.fields, [key]: change(field) } } : draft;
}

const onPage = (x: number, y: number, page: PageSize) => ({ x: clamp(x, 0, page.width - EDGE), y: clamp(y, 0, page.height - EDGE) });

/** A drag that started with the field at `from`, moved by (dx, dy) screen pixels. Screen y runs down, PDF y up. */
export const dragTo = (draft: Draft, key: Key, from: { x: number; y: number }, dx: number, dy: number, page: PageSize, scale: number): Draft =>
  update(draft, key, (f) => ({ ...f, ...onPage(snap(from.x + dx / scale), snap(from.y - dy / scale), page) }));

/** A drag of the right-edge grip that started at `fromWidth` points, moved by dx screen pixels. */
export const dragWidth = (draft: Draft, key: Key, fromWidth: number, dx: number, scale: number): Draft =>
  update(draft, key, (f) => ({ ...f, maxWidth: Math.max(MIN_WIDTH, snap(fromWidth + dx / scale)) }));

export type Arrow = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export const isArrow = (key: string): key is Arrow => key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';

/** An arrow key: up moves the box up the page (PDF y grows). */
export function nudge(draft: Draft, key: Key, arrow: Arrow, big: boolean, page: PageSize): Draft {
  const step = big ? BIG_STEP : SNAP;
  const steps: Record<Arrow, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  const [dx, dy] = steps[arrow];
  return update(draft, key, (f) => ({ ...f, ...onPage(f.x + dx, f.y + dy, page) }));
}

/** A− / A+: half a point at a time, 6 to 24 pt. */
export const resize = (draft: Draft, key: Key, delta: number): Draft =>
  update(draft, key, (f) => ({ ...f, size: clamp(f.size + delta, MIN_SIZE, MAX_SIZE) }));

export const toggleBold = (draft: Draft, key: Key): Draft =>
  update(draft, key, ({ bold, ...f }) => (bold ? f : { ...f, bold: true }));

export function removeField(draft: Draft, key: Key): Draft {
  const fields = { ...draft.fields };
  delete fields[key];
  return { ...draft, fields };
}

/** Puts a field that isn't on the form in the middle of the page, ready to be dragged into place. */
export const addField = (draft: Draft, key: Key, page: PageSize): Draft => ({
  ...draft,
  fields: { ...draft.fields, [key]: { x: snap(page.width * 0.3), y: snap(page.height * 0.5), size: 10 } },
});

/** Moves fields next to the labels found on a new blank form (see src/options/pdfView.ts); other settings are kept. */
export function applySuggestions(draft: Draft, found: Partial<Record<Key, { x: number; y: number }>>): { draft: Draft; placed: number } {
  const keys = (Object.keys(found) as Key[]).filter((k) => found[k]);
  if (keys.length === 0) throw new Error("Couldn't find the form's labels (Date, Name, D.O.B. ...). Drag the boxes into place by hand.");
  const fields = { ...draft.fields };
  for (const key of keys) fields[key] = { size: 10, ...fields[key], x: found[key]!.x, y: found[key]!.y };
  return { draft: { ...draft, fields }, placed: keys.length };
}

// --- what the screen shows ------------------------------------------------------------

// The fonts' own metrics, as pdf-lib draws with them (its enum and the embedder's name type are the same strings).
type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const regular = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);
const bold = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName);
const widthAt = (isBold: boolean) => (text: string, size: number) => (isBold ? bold : regular).widthOfTextAtSize(text, size);

/** Where a field's box goes on screen, in pixels, and its sample text at the size it will print. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
  /** The box's width in points, where a width drag starts from. */
  widthPt: number;
}

/**
 * A field's box on screen. The text shrinks to fit exactly as it will print (same rule, same
 * font metrics as src/core/pdf.ts); the box is as wide as the maximum width, or the text.
 */
export function boxOf(key: Key, field: Placed, page: PageSize, scale: number): Box {
  const text = SAMPLE_VALUES[key];
  const measure = widthAt(!!field.bold);
  const size = fitSize(text, field.size, field.maxWidth, measure);
  const widthPt = field.maxWidth ?? measure(text, size);
  return {
    left: field.x * scale,
    // the baseline sits at y; the box starts about a cap height above it
    top: (page.height - field.y) * scale - 0.85 * size * scale,
    width: widthPt * scale,
    height: size * 1.2 * scale,
    fontSize: size * scale,
    text,
    widthPt,
  };
}
