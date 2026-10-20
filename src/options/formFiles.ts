/**
 * File dialogs for the settings page (Edge/Chrome's File System Access API).
 *
 * A page can't open a dialog at a path it names (such as S:\Rosebud\forms), only at a
 * well-known folder or at a file chosen before. So the shared "forms" folder is remembered
 * per computer: the first Share or Load there opens in Documents, and once someone has
 * gone to Rosebud\forms, later dialogs on that computer open there.
 */

type StartIn = FileSystemHandle | 'documents' | 'downloads';
interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface PickerWindow {
  showOpenFilePicker(options: { startIn?: StartIn; types?: PickerType[]; excludeAcceptAllOption?: boolean }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options: { startIn?: StartIn; suggestedName?: string; types?: PickerType[] }): Promise<FileSystemFileHandle>;
}

const PDF: PickerType = { description: 'Blank form (PDF)', accept: { 'application/pdf': ['.pdf'] } };
const FORM: PickerType = { description: 'Rosebud form file', accept: { 'application/json': ['.json'] } };

const pickers = () => window as unknown as PickerWindow;
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

// The last form file shared or loaded on this computer; its folder is where the next dialog opens.
const DB = 'rosebud';
const STORE = 'handles';
const KEY = 'formsFolder';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function remembered(): Promise<FileSystemHandle | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const get = db.transaction(STORE).objectStore(STORE).get(KEY);
      get.onsuccess = () => resolve(get.result as FileSystemHandle | undefined);
      get.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function remember(handle: FileSystemHandle): Promise<void> {
  try {
    const db = await openDb();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY);
  } catch {
    // Only a convenience: the next dialog opens in Documents instead.
  }
}

/** Opens a dialog in the remembered forms folder, or in Documents if that folder is gone. */
async function inFormsFolder<T>(open: (startIn: StartIn) => Promise<T>): Promise<T> {
  const folder = await remembered();
  if (!folder) return open('documents');
  try {
    return await open(folder);
  } catch (error) {
    if (cancelled(error)) throw error;
    return open('documents');
  }
}

/** True until this computer has shared or loaded a form file (so the page can say where to go). */
export async function formsFolderKnown(): Promise<boolean> {
  return (await remembered()) !== undefined;
}

/** A blank form PDF, from a dialog that opens in Downloads. Null if the user cancels. */
export async function pickBlankPdf(): Promise<File | null> {
  try {
    const [handle] = await pickers().showOpenFilePicker({ startIn: 'downloads', types: [PDF], excludeAcceptAllOption: true });
    return handle ? handle.getFile() : null;
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

/** A Rosebud form file, from a dialog that opens in the forms folder. Null if the user cancels. */
export async function pickFormFile(): Promise<File | null> {
  try {
    const [handle] = await inFormsFolder((startIn) => pickers().showOpenFilePicker({ startIn, types: [FORM] }));
    if (!handle) return null;
    await remember(handle);
    return handle.getFile();
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

/** Saves a form file through a dialog that opens in the forms folder. Returns the file name, or null if cancelled. */
export async function shareFormFile(suggestedName: string, text: string): Promise<string | null> {
  let handle: FileSystemFileHandle;
  try {
    handle = await inFormsFolder((startIn) => pickers().showSaveFilePicker({ startIn, suggestedName, types: [FORM] }));
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
  try {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  } catch {
    throw new Error("The form file couldn't be saved there. Check that the shared drive is connected and that you can save files in that folder.");
  }
  await remember(handle);
  return handle.name;
}
