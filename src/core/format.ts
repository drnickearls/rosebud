import type { CalendarDate, FormValues } from './types.js';

/** "7" to "07". */
export const pad = (n: number) => String(n).padStart(2, '0');

/** "Potter, Harry" becomes "Harry Potter" (the Routing Form reads first name first). */
export function firstLast(chartName: string): string {
  const name = chartName.replace(/\s+/g, ' ').trim();
  const comma = name.indexOf(',');
  if (comma < 0) return name;
  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  return [first, last].filter(Boolean).join(' ');
}

/** "Dumbledore, Albus" becomes "Dumbledore" (the provider is printed by last name only). */
export function lastNameOnly(chartName: string): string {
  const name = chartName.replace(/\s+/g, ' ').trim();
  const comma = name.indexOf(',');
  return (comma < 0 ? name : name.slice(0, comma)).trim();
}

/** "07/31/1980" or "7/31/1980" to a date; null when it isn't one. */
export function parseUsDate(text: string): CalendarDate | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!m) return null;
  const date = { month: Number(m[1]), day: Number(m[2]), year: Number(m[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null;
  return date;
}

export const formatUsDate = (d: CalendarDate): string => `${pad(d.month)}/${pad(d.day)}/${d.year}`;

/** "Tuesday 10/13/2026" */
export function dateLabel(d: CalendarDate): string {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
  return `${weekday} ${formatUsDate(d)}`;
}

/** Two dates compare equal when year, month and day do. */
export const sameDate = (a: CalendarDate, b: CalendarDate): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Age on a given day: whole years, or months under two years ("14 mo"), counting a month
 * only once the day of the month has been reached.
 */
export function ageOn(dob: CalendarDate, on: CalendarDate): string {
  let months = (on.year - dob.year) * 12 + (on.month - dob.month);
  if (on.day < dob.day) months -= 1;
  if (months < 0) months = 0;
  if (months < 24) return `${months} mo`;
  return String(Math.floor(months / 12));
}

/** Minutes after midnight for "9:00 PM" / "12:05 AM"; null when it isn't a time. */
export function timeToMinutes(text: string): number | null {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(m[2]);
}

/** "$12.5", "$1,234.50" to "12.50", and a zero balance to "0"; '' only when the balance could not be read. */
export function balanceText(text: string | null | undefined): string {
  if (!text) return '';
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return '';
  const value = Number(cleaned);
  return value > 0 ? value.toFixed(2) : '0';
}

/** What goes on the Reason For Visit line: `Exam type — reason`, or just the exam type. */
export function reasonLine(examType: string, rfv: string | null): string {
  const type = examType.trim();
  return rfv ? (type ? `${type} — ${rfv}` : rfv) : type;
}

export interface PatientFacts {
  chartName: string; // "Potter, Harry"
  dob: CalendarDate | null; // null when the source did not show it: D.O.B. and Age print blank
  patientId: string;
  patientBalance: string | null; // as shown: "$0.00"
}

export interface AppointmentFacts {
  /** The provider as the schedule shows them ("Last, First"), or '' when unknown; only the last name prints. */
  provider: string;
  date: CalendarDate;
  time: string; // "9:00 PM", or '' when it couldn't be found
  examType: string; // already cleaned
  rfv: string | null;
}

/** One Routing Form's worth of values from what was read. */
export function formValues(patient: PatientFacts, appointment: AppointmentFacts): FormValues {
  return {
    provider: lastNameOnly(appointment.provider),
    date: formatUsDate(appointment.date),
    appointmentTime: appointment.time,
    name: firstLast(patient.chartName),
    dob: patient.dob ? formatUsDate(patient.dob) : '',
    age: patient.dob ? ageOn(patient.dob, appointment.date) : '',
    patientId: patient.patientId,
    balanceDue: balanceText(patient.patientBalance),
    reasonForVisit: reasonLine(appointment.examType, appointment.rfv),
  };
}
