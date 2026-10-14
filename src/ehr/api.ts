/**
 * Read-only calls to RevolutionEHR's own web services, the same ones its screens make, sent
 * with the signed-in user's session (a cookie) and the anti-forgery token that cookie
 * carries. They answer in milliseconds, which is why Rosebud uses them instead of opening
 * screens to read them (a hidden browser tab took minutes). Only "find…/get…" calls are
 * made here; nothing in Rosebud ever writes to a chart.
 */

import { sameDate } from '../core/format.js';
import type { CalendarDate } from '../core/types.js';

const pad = (n: number) => String(n).padStart(2, '0');

function antiForgeryToken(): string {
  const cookie = document.cookie.split(';').map((c) => c.trim()).find((c) => /^XSRF-TOKEN=/i.test(c));
  if (!cookie) throw new Error('RevolutionEHR is not signed in on this tab (no session token). Reload the page and sign in.');
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': antiForgeryToken() },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`RevolutionEHR answered ${response.status} to ${path.split('/').slice(-2).join('/')}.`);
  return (await response.json()) as T;
}

export interface PersonName {
  lastName: string;
  firstName: string;
  patientId?: number;
}

/** One appointment in a day's list (free slots and busy time are filtered out). */
export interface DayAppointment {
  scheduleItemId: number;
  startDate: string; // UTC, "2026-10-13T12:50:00Z"
  status: number;
  patientName: PersonName & { patientId: number };
  provider: { lastName: string; firstName: string };
  patientDob: string | null; // "1980-07-31"
  template: string; // exam type
}

/**
 * Statuses of appointments that are not on the schedule screen: found by comparing a day's
 * service list with its Agenda on screen (2, 5 and 6 never appear there; 0 scheduled and 3
 * completed do). Anything else is kept, so an unfamiliar "arrived" status can't drop a patient.
 */
const HIDDEN_STATUSES = new Set([2, 5, 6]);

export async function scheduleDay(date: CalendarDate, locationId: number, signal?: AbortSignal): Promise<DayAppointment[]> {
  const day = `${date.year}-${pad(date.month)}-${pad(date.day)}`;
  const answer = await post<{ scheduleItemCalendarResponses: ({ '@class': string } & Partial<DayAppointment>)[] }>(
    '/pms2/ws/schedule/findScheduleItems',
    { startDate: day, locationId, scheduleView: 'day' },
    signal,
  );
  return answer.scheduleItemCalendarResponses.filter(
    (i) => i['@class'] === 'AppointmentCalendarResponse' && i.patientName?.patientId && !HIDDEN_STATUSES.has(i.status ?? 0),
  ) as DayAppointment[];
}

/** What the Appointment panel shows beyond the list: the Comments and the exam type. */
export interface AppointmentDetail {
  description: string;
  patientId: number;
  template: { name: string } | null;
  locationSummary: { id: number } | null;
}

export const appointmentDetail = (scheduleItemId: number, signal?: AbortSignal) =>
  post<AppointmentDetail>(`/pms2/ws/schedule/findScheduleItemSidebarById/${scheduleItemId}`, undefined, signal);

/** Patient Balance, in dollars. */
export async function patientBalance(patientId: string, signal?: AbortSignal): Promise<number> {
  const answer = await post<{ patientBalance: number }>(`/pms2/ws/patient/pod/getAccountBalancesAndCreditsByPatientId/${patientId}`, undefined, signal);
  return answer.patientBalance;
}

export interface NextAppointment {
  appointmentId: number;
  startDate: string;
  templateName: string;
  provider?: { lastName: string; firstName: string } | null;
}

export async function nextAppointment(patientId: string, signal?: AbortSignal): Promise<NextAppointment | null> {
  const answer = await post<{ nextAppointmentResponse: NextAppointment | null }>(`/pms2/ws/patient/pod/findLastAndNextEncounterByPatientId/${patientId}`, undefined, signal);
  return answer.nextAppointmentResponse ?? null;
}

/** The patient's primary location: the practice's location id for a single-location practice. */
export async function primaryLocationId(patientId: string, signal?: AbortSignal): Promise<number> {
  const answer = await post<{ primaryLocation: { id: number } | null }>(`/pms2/ws/patient/getPatientDashboardSummaryById/${patientId}`, undefined, signal);
  if (!answer.primaryLocation?.id) throw new Error("This patient has no primary location, so today's schedule can't be looked up.");
  return answer.primaryLocation.id;
}

// --- the schedule's own location id ------------------------------------------------

let scheduleLocationId: number | null = null;

/**
 * The location the schedule screen is showing. It is learned by watching the schedule's own
 * request for the day (it carries the id), so Rosebud follows the location the user chose.
 * Installed as early as possible; the schedule's refresh button repeats the request.
 */
export function watchScheduleLocation(): void {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __rosebudUrl?: string }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__rosebudUrl = String(url);
    return (open as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __rosebudUrl?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
    if (this.__rosebudUrl?.includes('/schedule/findScheduleItems') && typeof body === 'string') {
      try {
        const id = (JSON.parse(body) as { locationId?: unknown }).locationId;
        if (typeof id === 'number') scheduleLocationId = id;
      } catch {
        // not the request we want
      }
    }
    return send.call(this, body);
  };
}

export const knownScheduleLocationId = (): number | null => scheduleLocationId;

// --- time ----------------------------------------------------------------------------

/** "2026-10-13T12:50:00Z" to the PC's local clock: its date and "8:50 AM". */
export function localWhen(iso: string): { date: CalendarDate; time: string } {
  const d = new Date(iso);
  const hour24 = d.getHours();
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    date: { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    time: `${hour}:${pad(d.getMinutes())} ${hour24 < 12 ? 'AM' : 'PM'}`,
  };
}

/** True when the appointment starts on the given local day. */
export const startsOn = (iso: string, date: CalendarDate): boolean => sameDate(localWhen(iso).date, date);
