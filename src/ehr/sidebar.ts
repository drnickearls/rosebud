import { cleanExamType } from '../core/appointment.js';
import { parseUsDate } from '../core/format.js';
import type { CalendarDate } from '../core/types.js';
import { clean, isShown } from './dom.js';

/** What the schedule's right-hand Appointment panel shows for one appointment. */
export interface SidebarRead {
  chartName: string; // "Potter, Harry"
  patientId: string;
  dob: CalendarDate | null;
  date: CalendarDate | null;
  time: string; // start, "9:00 PM"
  examType: string; // without bracketed detail
  comments: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Tue October 13, 20269:00 PM - 9:10 PM" (the panel runs the date and time together). */
export function parseSidebarWhen(text: string): { date: CalendarDate; time: string } | null {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*(\d{1,2}:\d{2})\s*([AP]M)/.exec(clean(text));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
  if (month < 1) return null;
  return { date: { year: Number(m[3]), month, day: Number(m[2]) }, time: `${m[4]} ${m[5]!.toUpperCase()}` };
}

export function sidebarElement(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('pms-appointment-sidebar');
  return el && isShown(el) ? el : null;
}

/** The open appointment's patient id, or null when no appointment is open (or it is still loading). */
export function sidebarPatientId(): string | null {
  const sb = sidebarElement();
  if (!sb) return null;
  for (const small of sb.querySelectorAll('small')) {
    const m = /^#(\d+)$/.exec(clean(small.textContent));
    if (m) return m[1]!;
  }
  return null;
}

/** Reads the open Appointment panel. Never touches its buttons (Confirm, Start, Reschedule, No-show, Cancel, Save). */
export function readSidebar(): SidebarRead | null {
  const sb = sidebarElement();
  const patientId = sidebarPatientId();
  if (!sb || !patientId) return null;

  const nameLink = sb.querySelector<HTMLElement>('h5.media-heading a');
  const chartName = clean(nameLink?.textContent).replace(/[*\s]+$/, '');
  const dobText = [...sb.querySelectorAll('small')].map((s) => clean(s.textContent)).find((t) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(t));
  const when = parseSidebarWhen(sb.innerText);
  const typeLink = [...sb.querySelectorAll<HTMLElement>('a')].find((a) => !a.closest('h5') && clean(a.textContent));
  const comments = sb.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '';
  if (!chartName || !when) return null;

  return {
    chartName,
    patientId,
    dob: dobText ? parseUsDate(dobText) : null,
    date: when.date,
    time: when.time,
    examType: cleanExamType(typeLink?.textContent ?? ''),
    comments,
  };
}
