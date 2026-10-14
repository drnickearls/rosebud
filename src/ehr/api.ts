/**
 * Read-only calls to RevolutionEHR's own web services, the same ones its screens make, sent
 * with the signed-in user's session (a cookie) and the anti-forgery token that cookie
 * carries. They answer in milliseconds, which is why Rosebud uses them instead of opening
 * screens to read them (a hidden browser tab took minutes). Only "find…/get…" calls are
 * made here; nothing in Rosebud ever writes to a chart. Answers are returned as the service
 * sends them; src/ehr/revolution.ts turns them into Rosebud's terms.
 */

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
}

/** One appointment in a day's list, as the service sends it. */
export interface DayAppointment {
  scheduleItemId: number;
  startDate: string; // UTC, "2026-10-13T12:50:00Z"
  status: number;
  patientName: PersonName & { patientId: number };
  provider: PersonName;
  patientDob: string | null; // "1980-07-31"
  template: string; // exam type
}

/** Every appointment of a day at a location, whatever its status; free slots and busy time are left out. */
export async function scheduleDay(date: CalendarDate, locationId: number, signal?: AbortSignal): Promise<DayAppointment[]> {
  const day = `${date.year}-${pad(date.month)}-${pad(date.day)}`;
  const answer = await post<{ scheduleItemCalendarResponses: ({ '@class': string } & Partial<DayAppointment>)[] }>(
    '/pms2/ws/schedule/findScheduleItems',
    { startDate: day, locationId, scheduleView: 'day' },
    signal,
  );
  return answer.scheduleItemCalendarResponses.filter(
    (i) => i['@class'] === 'AppointmentCalendarResponse' && i.patientName?.patientId,
  ) as DayAppointment[];
}

/** What the Appointment panel shows beyond the list: the Comments and the exam type. */
export interface AppointmentSidebar {
  description: string | null;
  template: { name: string } | null;
}

export const appointmentSidebar = (scheduleItemId: number, signal?: AbortSignal) =>
  post<AppointmentSidebar>(`/pms2/ws/schedule/findScheduleItemSidebarById/${scheduleItemId}`, undefined, signal);

/** Patient Balance, in dollars. */
export async function patientBalance(patientId: string, signal?: AbortSignal): Promise<number> {
  const answer = await post<{ patientBalance: number }>(`/pms2/ws/patient/pod/getAccountBalancesAndCreditsByPatientId/${patientId}`, undefined, signal);
  return answer.patientBalance;
}

/** The chart header's facts. The first name can carry a trailing space; the birth date is mid-day UTC. */
export interface DashboardSummary {
  name: PersonName | null;
  dateOfBirth: string | null; // "2008-01-05T18:00:00Z"
  primaryLocation: { id: number } | null;
}

export const dashboardSummary = (patientId: string, signal?: AbortSignal) =>
  post<DashboardSummary>(`/pms2/ws/patient/getPatientDashboardSummaryById/${patientId}`, undefined, signal);

/** The Exam History panel's Last Exam and Next Appt. */
export interface LastAndNext {
  lastEncounterResponse: { encounterDate: string | null } | null; // UTC
  nextAppointmentResponse: {
    appointmentId: number;
    startDate: string; // UTC
    templateName: string;
    provider?: PersonName | null;
  } | null;
}

export const lastAndNext = (patientId: string, signal?: AbortSignal) =>
  post<LastAndNext>(`/pms2/ws/patient/pod/findLastAndNextEncounterByPatientId/${patientId}`, undefined, signal);

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
