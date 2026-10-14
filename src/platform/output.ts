/**
 * Where the finished PDF goes: a new browser tab, ready to print. Nothing is saved to disk
 * or sent anywhere; the PDF exists only as long as that tab does.
 *
 * The tab opens only when the PDF is ready, so the user stays on the screen they were on
 * while it is made. Browsers allow a new tab for a few seconds after a click, which covers
 * a normal run; if it is blocked anyway, the caller shows a link to click instead.
 */
export function showPdf(pdf: Uint8Array): { opened: boolean; url: string } {
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
  return { opened: Boolean(window.open(url, '_blank')), url };
}
