import { bundledAssets } from '../core/assets.js';
import { parsePackage } from '../core/form.js';
import type { FormAssets } from '../core/pdf.js';
import { FORM_REQUEST, FORM_RESPONSE, type FormRequest, type FormResponse } from '../extension/messages.js';

/**
 * The form in use, as seen from the RevolutionEHR page: the one saved on the extension's
 * settings page (asked for through the bridge), or the one built into the extension. The
 * saved form is a blank form and field positions only, never patient information.
 */
export interface CurrentForm {
  assets: FormAssets;
  custom: boolean;
}

let counter = 0;

function savedFormText(timeoutMs = 2000): Promise<string | null> {
  const id = `form-${Date.now()}-${++counter}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(value: string | null) {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as FormResponse | undefined;
      if (event.source === window && data?.type === FORM_RESPONSE && data.id === id) finish(data.value);
    }
    window.addEventListener('message', onMessage);
    const request: FormRequest = { type: FORM_REQUEST, id };
    window.postMessage(request, location.origin);
  });
}

export async function currentForm(): Promise<CurrentForm> {
  try {
    const saved = await savedFormText();
    if (saved) return { assets: await parsePackage(saved), custom: true };
  } catch {
    // an unreadable saved form must never stop a print: fall back to the built-in form
  }
  return { assets: bundledAssets, custom: false };
}
