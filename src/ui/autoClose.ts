/** A message that worked, with nothing to read or click, fades after this long. */
export const FADE_AFTER_MS = 5000;
/** How long the fade itself takes (matches `.panel.fading` in styles.ts). */
export const FADE_MS = 400;

/**
 * Only a plain "done" message closes itself. Warnings, errors and the "Open the PDF" link
 * (shown when the browser blocked the new tab) stay until the user clicks Close.
 */
export function fadesOnItsOwn(message: { kind: string; warnings?: string[]; pdfUrl?: string | undefined }): boolean {
  return message.kind === 'done' && (message.warnings?.length ?? 0) === 0 && !message.pdfUrl;
}

export interface AutoClose {
  /** The mouse is over the message: stop the clock, and undo a fade in progress. */
  pause(): void;
  /** The mouse left: start the full wait again. */
  resume(): void;
  cancel(): void;
}

/** Starts at once: after `after` ms `setFading(true)`, then `close()` once the fade is done. */
export function autoClose(setFading: (fading: boolean) => void, close: () => void, after = FADE_AFTER_MS, fade = FADE_MS): AutoClose {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fading = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const start = () => {
    clear();
    timer = setTimeout(() => {
      fading = true;
      setFading(true);
      timer = setTimeout(close, fade);
    }, after);
  };
  start();
  return {
    pause() {
      clear();
      if (fading) {
        fading = false;
        setFading(false);
      }
    },
    resume: start,
    cancel: clear,
  };
}
