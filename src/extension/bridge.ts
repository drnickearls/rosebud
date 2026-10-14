/**
 * The extension's ISOLATED-world content script: the page's only link to the extension.
 * page.js runs in the page's own world (MAIN), where chrome.* doesn't exist, so it asks here
 * for the form saved by the settings page.
 */

import { chromeApi } from '../platform/chrome.js';
import { FORM_REQUEST, FORM_RESPONSE, FORM_STORAGE_KEY, type FormRequest, type FormResponse } from './messages.js';

window.addEventListener('message', (event) => {
  const request = event.data as FormRequest | undefined;
  if (event.source !== window || request?.type !== FORM_REQUEST) return;
  const reply = (value: string | null) => {
    const response: FormResponse = { type: FORM_RESPONSE, id: request.id, value };
    window.postMessage(response, location.origin);
  };
  chromeApi.storage.local.get(FORM_STORAGE_KEY).then(
    (items) => reply(typeof items[FORM_STORAGE_KEY] === 'string' ? (items[FORM_STORAGE_KEY] as string) : null),
    () => reply(null),
  );
});
