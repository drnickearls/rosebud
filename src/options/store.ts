import { FORM_STORAGE_KEY } from '../extension/messages.js';
import { chromeApi } from '../platform/chrome.js';

/** The saved form file's text (see core/form.ts), or null when the built-in form is in use. */
export async function savedFormText(): Promise<string | null> {
  const items = await chromeApi.storage.local.get(FORM_STORAGE_KEY);
  const value = items[FORM_STORAGE_KEY];
  return typeof value === 'string' ? value : null;
}

export async function saveFormText(text: string): Promise<void> {
  try {
    await chromeApi.storage.local.set({ [FORM_STORAGE_KEY]: text });
  } catch {
    throw new Error("The browser wouldn't save the form. Use Export to keep a copy.");
  }
}

export const clearSavedForm = (): Promise<void> => chromeApi.storage.local.remove(FORM_STORAGE_KEY);
