// Prints the position of every text run on page 1 of a PDF (PDF points, origin bottom-left).
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const pdf = await pdfjs.getDocument({ data }).promise;
const page = await pdf.getPage(1);
const vp = page.getViewport({ scale: 1 });
console.log('pages', pdf.numPages, 'size', vp.width, vp.height);
const pat = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
for (const it of (await page.getTextContent()).items) {
  if (!it.str.trim() || (pat && !pat.test(it.str))) continue;
  console.log(it.transform[4].toFixed(1), it.transform[5].toFixed(1), 'w', it.width.toFixed(1), 'h', it.height.toFixed(1), JSON.stringify(it.str));
}
