import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bundledAssets } from '../src/core/assets.js';
import { SAMPLE_VALUES } from '../src/core/form.js';
import { fitSize } from '../src/core/pdf.js';
import {
  addField,
  applySuggestions,
  assetsOf,
  boxOf,
  dragTo,
  dragWidth,
  draftOf,
  nudge,
  removeField,
  resize,
  toggleBold,
  unplaced,
  type Draft,
} from '../src/formEditor/index.js';

const LETTER = { width: 612, height: 792 };
const SCALE = 2;

const draft = (): Draft => ({
  name: 'Test form',
  blankPdf: bundledAssets.blankPdf,
  fields: { name: { x: 100, y: 700, size: 20, bold: true }, age: { x: 300, y: 700, size: 12, maxWidth: 40 } },
});

test('a form round-trips through a draft unchanged', () => {
  assert.deepEqual(assetsOf(draftOf(bundledAssets)).template.fields, bundledAssets.template.fields.map((f) => ({ size: 10, ...f })));
});

test('assets list fields in the settings order and are checked like a loaded file', () => {
  const out = assetsOf(draft());
  assert.deepEqual(out.template.fields.map((f) => f.key), ['name', 'age']);
  assert.throws(() => assetsOf({ ...draft(), fields: {} }), /lists no fields/);
});

test('dragging: screen down is PDF down, positions snap to half a point', () => {
  // 21 px right and 13 px down at 2 px per point = +10.5 x, -6.5 y
  const moved = dragTo(draft(), 'name', { x: 100, y: 700 }, 21, 13, LETTER, SCALE);
  assert.deepEqual(moved.fields.name, { x: 110.5, y: 693.5, size: 20, bold: true });
  const snapped = dragTo(draft(), 'name', { x: 100, y: 700 }, 0.7, 0, LETTER, SCALE);
  assert.equal(snapped.fields.name!.x, 100.5); // 100.35 snaps to 100.5
});

test('dragging stays on the page', () => {
  const far = dragTo(draft(), 'name', { x: 100, y: 700 }, 5000, -5000, LETTER, SCALE);
  assert.deepEqual([far.fields.name!.x, far.fields.name!.y], [607, 787]);
  const off = dragTo(draft(), 'name', { x: 100, y: 700 }, -5000, 5000, LETTER, SCALE);
  assert.deepEqual([off.fields.name!.x, off.fields.name!.y], [0, 0]);
});

test('the width grip: snapped, never under 8 points', () => {
  assert.equal(dragWidth(draft(), 'age', 40, 21, SCALE).fields.age!.maxWidth, 50.5);
  assert.equal(dragWidth(draft(), 'age', 40, -500, SCALE).fields.age!.maxWidth, 8);
});

test('arrow keys: up is up the page, Shift is 5 points', () => {
  assert.equal(nudge(draft(), 'name', 'ArrowUp', false, LETTER).fields.name!.y, 700.5);
  assert.equal(nudge(draft(), 'name', 'ArrowDown', true, LETTER).fields.name!.y, 695);
  assert.equal(nudge(draft(), 'name', 'ArrowLeft', true, LETTER).fields.name!.x, 95);
});

test('text size steps between 6 and 24, bold toggles, fields come off and go back on', () => {
  assert.equal(resize(draft(), 'name', 0.5).fields.name!.size, 20.5);
  assert.equal(resize(draft(), 'name', 10).fields.name!.size, 24);
  assert.equal(resize(draft(), 'age', -10).fields.age!.size, 6);
  assert.equal(toggleBold(draft(), 'name').fields.name!.bold, undefined);
  assert.equal(toggleBold(draft(), 'age').fields.age!.bold, true);
  const off = removeField(draft(), 'age');
  assert.ok(unplaced(off).includes('age'));
  assert.deepEqual(addField(off, 'age', LETTER).fields.age, { x: 183.5, y: 396, size: 10 });
  const d = draft();
  assert.equal(resize(d, 'dob', 1), d); // a field not on the form is left alone
});

test('suggested positions move fields and keep their other settings', () => {
  const { draft: placed, placed: count } = applySuggestions(draft(), { name: { x: 50, y: 600 }, dob: { x: 260, y: 600 } });
  assert.equal(count, 2);
  assert.deepEqual(placed.fields.name, { x: 50, y: 600, size: 20, bold: true });
  assert.deepEqual(placed.fields.dob, { x: 260, y: 600, size: 10 });
  assert.throws(() => applySuggestions(draft(), {}), /Couldn't find the form's labels/);
});

test("the screen box: y flipped, and the sample shrinks exactly as the PDF's text will", async () => {
  const field = { x: 300, y: 700, size: 12, maxWidth: 40 };
  const box = boxOf('reasonForVisit', field, LETTER, SCALE);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const printed = fitSize(SAMPLE_VALUES.reasonForVisit, 12, 40, (t, s) => font.widthOfTextAtSize(t, s));
  assert.equal(box.fontSize, printed * SCALE);
  assert.equal(box.fontSize, 6 * SCALE); // the long sample reason hits the 6 pt floor
  assert.equal(box.left, 600);
  assert.equal(box.top, (792 - 700) * SCALE - 0.85 * 6 * SCALE);
  assert.equal(box.width, 40 * SCALE);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const name = boxOf('name', { x: 100, y: 700, size: 20, bold: true }, LETTER, 1);
  assert.equal(name.widthPt, bold.widthOfTextAtSize(SAMPLE_VALUES.name, 20)); // no max width: as wide as the bold text
});
