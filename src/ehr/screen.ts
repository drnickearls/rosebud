/**
 * What the user has on screen: only the context a print starts from (which chart, which
 * schedule day and providers, which appointment is open). Every fact printed on a form comes
 * from the web services instead (src/ehr/api.ts). Nothing here clicks or writes anything.
 */

import { parseUsDate } from '../core/format.js';
import type { CalendarDate } from '../core/types.js';

const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** Whether an element is laid out on screen (RevolutionEHR keeps stale hidden panels around). */
const isShown = (el: Element): boolean => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0;

/** The patient id in the address of a patient summary page, or null on any other page. */
export function chartPatientId(hash = location.hash): string | null {
  return /\/patients\/patient\/(\d+)\/patient-summary/.exec(hash)?.[1] ?? null;
}

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

/** "Tue October 13, 20269:00 PM - 9:10 PM" (the panel runs the date and time together) to its start time, "9:00 PM". */
export function sidebarStartTime(text: string): string | null {
  const m = /[A-Za-z]+\s+\d{1,2},\s*\d{4}\s*(\d{1,2}:\d{2})\s*([AP]M)/.exec(clean(text));
  return m ? `${m[1]} ${m[2]!.toUpperCase()}` : null;
}

/**
 * The appointment open in the schedule's right-hand Appointment panel: its patient id (the
 * "#123" line) and start time. Never touches the panel's buttons (Confirm, Start,
 * Reschedule, No-show, Cancel, Save).
 */
export function openAppointment(): { patientId: string; time: string } | null {
  const sb = document.querySelector<HTMLElement>('pms-appointment-sidebar');
  if (!sb || !isShown(sb)) return null;
  const patientId = [...sb.querySelectorAll('small')].map((s) => /^#(\d+)$/.exec(clean(s.textContent))?.[1]).find(Boolean);
  const time = sidebarStartTime(sb.innerText);
  return patientId && time ? { patientId, time } : null;
}
