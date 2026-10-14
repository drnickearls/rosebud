import type { FormStorage } from './index.js';

/** page.js (MAIN world) asks bridge.js (ISOLATED world) for the saved form with these messages. */
export const FORM_REQUEST = 'rosebud:form-request';
export const FORM_RESPONSE = 'rosebud:form-response';

export interface FormRequest {
  type: typeof FORM_REQUEST;
  id: string;
}

export interface FormResponse {
  type: typeof FORM_RESPONSE;
  id: string;
  /** The saved form file's text, or null when none is saved. */
  value: string | null;
  /** Set when the bridge couldn't read the browser's storage. */
  error?: string;
}

let counter = 0;

/**
 * The saved form as seen from the RevolutionEHR page, where chrome.* doesn't exist: asked of
 * the bridge script by message. Read only; the form is saved on the settings page.
 */
export function pageFormStorage(timeoutMs = 2000): FormStorage {
  const readOnly = () => Promise.reject(new Error('The form is changed on the settings page, not from RevolutionEHR.'));
  return {
    read: () =>
      new Promise((resolve, reject) => {
        const id = `form-${Date.now()}-${++counter}`;
        const timer = setTimeout(() => finish(() => reject(new Error("the extension didn't answer; reload the page"))), timeoutMs);
        function finish(settle: () => void) {
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          settle();
        }
        function onMessage(event: MessageEvent) {
          const data = event.data as FormResponse | undefined;
          if (event.source !== window || data?.type !== FORM_RESPONSE || data.id !== id) return;
          finish(() => (data.error ? reject(new Error(data.error)) : resolve(data.value)));
        }
        window.addEventListener('message', onMessage);
        window.postMessage({ type: FORM_REQUEST, id } satisfies FormRequest, location.origin);
      }),
    write: readOnly,
    remove: readOnly,
  };
}
