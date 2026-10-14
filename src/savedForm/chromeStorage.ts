import { chromeApi } from '../platform/chrome.js';
import type { FormStorage } from './index.js';
import { FORM_REQUEST, FORM_RESPONSE, type FormRequest, type FormResponse } from './pageBridge.js';

/** Where the saved form lives in chrome.storage.local. */
const KEY = 'rosebud.form.v1';

/** The saved form in chrome.storage.local: used by the settings page and the bridge script. */
export const chromeFormStorage: FormStorage = {
  async read() {
    // After the extension is reloaded, a tab's old bridge script loses chrome.storage.
    if (!chromeApi?.storage?.local) throw new Error('Rosebud was reloaded after this page opened; reload RevolutionEHR (and sign in again) to use it');
    const value = (await chromeApi.storage.local.get(KEY))[KEY];
    return typeof value === 'string' ? value : null;
  },
  write: (text) => chromeApi.storage.local.set({ [KEY]: text }),
  remove: () => chromeApi.storage.local.remove(KEY),
};

/**
 * Answers the RevolutionEHR page's requests for the saved form (see ./pageBridge.ts). Runs in
 * the bridge script (ISOLATED world), the only place on that page where chrome.* exists.
 */
export function answerFormRequests(storage: FormStorage = chromeFormStorage): void {
  window.addEventListener('message', (event) => {
    const request = event.data as FormRequest | undefined;
    if (event.source !== window || request?.type !== FORM_REQUEST) return;
    const reply = (response: Omit<FormResponse, 'type' | 'id'>) =>
      window.postMessage({ type: FORM_RESPONSE, id: request.id, ...response } satisfies FormResponse, location.origin);
    storage.read().then(
      (value) => reply({ value }),
      (error: unknown) => reply({ value: null, error: error instanceof Error ? error.message : String(error) }),
    );
  });
}
