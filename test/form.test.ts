import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledAssets } from '../src/core/assets.js';
import { FIELD_KEYS, fromBase64, inspectBlankPdf, parsePackage, stringifyPackage, toBase64, validateTemplate } from '../src/core/form.js';

test('the built-in template is valid and covers every field Rosebud can print', () => {
  const t = validateTemplate(bundledAssets.template);
  assert.deepEqual(t.fields.map((f) => f.key).sort(), [...FIELD_KEYS].sort());
});

test('template errors are plain', () => {
  assert.throws(() => validateTemplate(null), /no template/);
  assert.throws(() => validateTemplate({ fields: [] }), /no fields/);
  assert.throws(() => validateTemplate({ fields: [{ key: 'ssn', x: 1, y: 1 }] }), /"ssn".*can't fill/);
  assert.throws(() => validateTemplate({ fields: [{ key: 'name', x: 1 }] }), /number for x and for y/);
  assert.throws(() => validateTemplate({ fields: [{ key: 'name', x: 1, y: 1, size: 0 }] }), /size.*above 0/);
  assert.throws(() => validateTemplate({ fields: [{ key: 'name', x: 1, y: 1, maxWidth: -3 }] }), /maximum width/);
  assert.throws(() => validateTemplate({ fields: [{ key: 'name', x: 1, y: 1 }, { key: 'name', x: 2, y: 2 }] }), /twice/);
});

test('template keeps only what it knows', () => {
  const t = validateTemplate({ name: ' My form ', fields: [{ key: 'age', x: 10, y: 20, size: 9, extra: 'x' }] });
  assert.deepEqual(t, { name: 'My form', font: 'Helvetica', fields: [{ key: 'age', x: 10, y: 20, size: 9 }] });
});

test('base64 round trip', () => {
  const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 251);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test('a blank PDF is checked, and a non-PDF is refused', async () => {
  assert.deepEqual(await inspectBlankPdf(bundledAssets.blankPdf), { pages: 1, width: 612, height: 792 });
  await assert.rejects(inspectBlankPdf(new TextEncoder().encode('hello')), /isn't a PDF/);
  await assert.rejects(inspectBlankPdf(new Uint8Array(4 * 1024 * 1024)), /larger than 3 MB/);
});

test('a form file round-trips, and other files are refused', async () => {
  const back = await parsePackage(stringifyPackage(bundledAssets));
  assert.deepEqual(back.template.fields, validateTemplate(bundledAssets.template).fields);
  assert.deepEqual(back.blankPdf, bundledAssets.blankPdf);
  await assert.rejects(parsePackage('not json'), /isn't a Rosebud form file/);
  await assert.rejects(parsePackage('{"format":"other"}'), /isn't a Rosebud form file/);
});

test('a form saved with the old three-piece birth date is carried over', () => {
  const t = validateTemplate({
    fields: [
      { key: 'dobMonth', x: 272.6, y: 734, size: 10 },
      { key: 'dobDay', x: 296, y: 734 },
      { key: 'dobYear', x: 321, y: 734 },
    ],
  });
  assert.deepEqual(t.fields, [{ key: 'dob', x: 272.6, y: 734, size: 10, maxWidth: 62 }]);
});

test('bold is carried through and checked', () => {
  const t = validateTemplate({ fields: [{ key: 'name', x: 1, y: 2, bold: true }, { key: 'age', x: 3, y: 4 }] });
  assert.deepEqual(t.fields, [{ key: 'name', x: 1, y: 2, bold: true }, { key: 'age', x: 3, y: 4 }]);
  assert.throws(() => validateTemplate({ fields: [{ key: 'name', x: 1, y: 2, bold: 'yes' }] }), /bold setting/);
});
