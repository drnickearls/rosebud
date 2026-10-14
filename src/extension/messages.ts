/** Where the saved form lives (chrome.storage.local): written by the settings page, read through the bridge. */
export const FORM_STORAGE_KEY = 'rosebud.form.v1';

/** page.js (MAIN world) asks bridge.js (ISOLATED world, the only place chrome.* exists) for the saved form. */
export const FORM_REQUEST = 'rosebud:form-request';
export const FORM_RESPONSE = 'rosebud:form-response';

export interface FormRequest {
  type: typeof FORM_REQUEST;
  id: string;
}

export interface FormResponse {
  type: typeof FORM_RESPONSE;
  id: string;
  /** The saved form file's text, or null when none is saved (the built-in form is used). */
  value: string | null;
}
