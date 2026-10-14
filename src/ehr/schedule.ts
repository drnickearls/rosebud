import { parseUsDate } from '../core/format.js';
import type { CalendarDate } from '../core/types.js';
import { clean, isShown } from './dom.js';

/** True on the schedule page. */
export const onSchedulePage = (hash = location.hash): boolean => /^#\/schedule\/schedule/.test(hash);

/** The date the schedule is showing (its hidden date picker holds it as MM/DD/YYYY). */
export function scheduleDate(): CalendarDate | null {
  for (const input of document.querySelectorAll<HTMLInputElement>('ejs-datepicker input')) {
    const date = parseUsDate(input.value);
    if (date) return date;
  }
  return null;
}

/** The provider columns on screen, left to right: the front desk chooses them with the schedule's own filter. */
export function providerColumns(): string[] {
  const heads = [...document.querySelectorAll<HTMLElement>('pms-schedule-assignee-header')].filter(isShown);
  const seen = new Set<string>();
  return heads
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    .map((h) => clean(h.textContent))
    .filter((name) => name && !seen.has(name) && !!seen.add(name));
}

/** Chart-style names compared without case or spacing differences. */
export const sameName = (a: string, b: string): boolean => clean(a).toLowerCase() === clean(b).toLowerCase();
