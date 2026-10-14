import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { bundledAssets } from '../src/core/assets.js';
import { buildPdf } from '../src/core/pdf.js';
import type { FormValues, PrintPart } from '../src/core/types.js';

const values: FormValues = {
  date: '10/13/2026',
  appointmentTime: '9:00 PM',
  name: 'Harry Potter',
  dob: '07/31/1980',
  age: '38',
  patientId: '117820477',
  balanceDue: '12.50',
  reasonForVisit: 'Cataract Post Op Exam — 1 month post op',
};

test('one form is one page, covers add pages, cover paginates', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({ time: '9:00 AM', name: `Patient ${i}`, examType: 'Long Medical' }));
  const parts: PrintPart[] = [
    { kind: 'cover', cover: { provider: 'Provider A', dateLabel: 'Tue 10/13/2026', rows } },
    { kind: 'form', values },
    { kind: 'form', values: { ...values, name: 'Zoë 中' } }, // an unencodable character must not fail the print
  ];
  const bytes = await buildPdf(parts, bundledAssets);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2 + 2); // 45 rows = 2 cover pages, plus 2 forms
  assert.deepEqual(doc.getPage(0).getSize(), { width: 612, height: 792 });
});

test('a lone form has the blank form\'s size', async () => {
  const bytes = await buildPdf([{ kind: 'form', values }], bundledAssets);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
