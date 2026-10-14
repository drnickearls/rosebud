/** Small DOM helpers shared by the readers. Nothing here writes to RevolutionEHR. */

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls until `read` returns something other than null/undefined/false, or the time runs
 * out (then null). A hidden tab's timers tick about once a second, so the interval is not
 * worth making finer than 250 ms.
 */
export async function waitFor<T>(read: () => T | null | undefined | false, timeoutMs = 15_000, intervalMs = 250): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() >= end) return null;
    await sleep(intervalMs);
  }
}

export const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** Whether an element is laid out on screen (RevolutionEHR keeps stale hidden panels around). */
export const isShown = (el: Element): boolean => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;

/** Lines of an element's visible text, trimmed, blanks dropped. */
export const linesOf = (el: HTMLElement): string[] =>
  el.innerText
    .split(/\r?\n/)
    .map((l) => clean(l))
    .filter(Boolean);

/** A real click as a user would make it. Used only on links and rows that open things. */
export function click(el: HTMLElement): void {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}
