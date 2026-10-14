/**
 * The saved form (CONTEXT.md, "Form Settings"): the Routing Form artwork and field positions
 * saved on this computer, or the form built into Rosebud when none is saved. One module for
 * loading, saving and going back to the built-in form, wherever it runs:
 *
 *   settings page   chrome.storage directly       (./chromeStorage.ts)
 *   RevolutionEHR   asks the bridge script for it (./pageBridge.ts; read only)
 *   tests           in memory
 *
 * A saved form that can't be read never stops a print: the built-in form is used and the
 * caller is told why, so staff aren't left wondering why their form changed.
 */

import { bundledAssets } from '../core/assets.js';
import { parsePackage, stringifyPackage } from '../core/form.js';
import type { FormAssets } from '../core/pdf.js';

/** Where the saved form's file text is kept. */
export interface FormStorage {
  /** The saved form file's text, or null when none is saved. */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  remove(): Promise<void>;
}

export interface LoadedForm {
  assets: FormAssets;
  /** True when a saved form is in use; false for the built-in form. */
  custom: boolean;
  /** Why the saved form couldn't be used (the built-in form is used instead); null when nothing went wrong. */
  problem: string | null;
}

export interface SavedForm {
  load(): Promise<LoadedForm>;
  save(assets: FormAssets): Promise<void>;
  /** Deletes the saved form: the built-in form is used from now on. */
  reset(): Promise<void>;
}

const UNREADABLE = 'The form saved on this computer could not be read, so the built-in form was used';

export function createSavedForm(storage: FormStorage): SavedForm {
  return {
    async load() {
      let text: string | null;
      try {
        text = await storage.read();
      } catch (error) {
        return { assets: bundledAssets, custom: false, problem: `${UNREADABLE} (${reason(error)}).` };
      }
      if (text === null) return { assets: bundledAssets, custom: false, problem: null };
      try {
        return { assets: await parsePackage(text), custom: true, problem: null };
      } catch (error) {
        return { assets: bundledAssets, custom: false, problem: `${UNREADABLE} (${reason(error)}).` };
      }
    },
    async save(assets) {
      try {
        await storage.write(stringifyPackage(assets));
      } catch {
        throw new Error("The browser wouldn't save the form. Use Export to keep a copy.");
      }
    },
    reset: () => storage.remove(),
  };
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\.$/, '');
