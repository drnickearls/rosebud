/**
 * The production Ehr (src/routingForms/ehr.ts): RevolutionEHR's web services for the facts,
 * the screen for the context. Service answers are turned into Rosebud's terms here, once:
 * UTC times onto the PC's clock, names trimmed, birth dates by their date part.
 */

import type { CalendarDate } from '../core/types.js';
import type { Appointment, AppointmentDetail, Ehr, Patient } from '../routingForms/ehr.js';
import {
  appointmentSidebar,
  dashboardSummary,
  knownScheduleLocationId,
  lastAndNext,
  patientBalance,
  scheduleDay,
  type AppointmentSidebar,
  type DashboardSummary,
  type DayAppointment,
  type LastAndNext,
  type PersonName,
} from './api.js';
import { chartPatientId, onSchedulePage, openAppointment, providerColumns, scheduleDate } from './screen.js';

const pad = (n: number) => String(n).padStart(2, '0');

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

/**
 * The date part of "2008-01-05T18:00:00Z" or "2008-01-05", as written: a birth date is a
 * calendar date, so it is never moved across time zones.
 */
export function datePart(text: string | null | undefined): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text ?? '');
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** "Potter", "Albus " to "Potter, Albus"; '' when there is no name. */
export const chartNameOf = (name: PersonName | null | undefined): string =>
  name ? [name.lastName?.trim(), name.firstName?.trim()].filter(Boolean).join(', ') : '';

export function toPatient(summary: DashboardSummary, encounters: LastAndNext): Patient {
  const next = encounters.nextAppointmentResponse;
  const lastDate = encounters.lastEncounterResponse?.encounterDate;
  return {
    chartName: chartNameOf(summary.name),
    dob: datePart(summary.dateOfBirth),
    lastExam: lastDate ? localWhen(lastDate).date : null,
    next: next
      ? { id: next.appointmentId, ...localWhen(next.startDate), examType: next.templateName ?? '', provider: chartNameOf(next.provider) }
      : null,
    primaryLocationId: summary.primaryLocation?.id ?? null,
  };
}

export const toAppointment = (a: DayAppointment): Appointment => ({
  id: a.scheduleItemId,
  patientId: String(a.patientName.patientId),
  chartName: chartNameOf(a.patientName),
  dob: datePart(a.patientDob),
  provider: chartNameOf(a.provider),
  ...localWhen(a.startDate),
  status: a.status,
  examType: a.template ?? '',
});

export const toDetail = (s: AppointmentSidebar): AppointmentDetail => ({ examType: s.template?.name ?? null, comments: s.description ?? '' });

export const revolutionEhr: Ehr = {
  screen: {
    patientId: () => chartPatientId(),
    schedule() {
      if (!onSchedulePage()) return null;
      const date = scheduleDate();
      const providers = providerColumns();
      return date && providers.length > 0 ? { date, providers, locationId: knownScheduleLocationId() } : null;
    },
    openAppointment: () => (onSchedulePage() ? openAppointment() : null),
  },
  async patient(id, signal) {
    const [summary, encounters] = await Promise.all([dashboardSummary(id, signal), lastAndNext(id, signal)]);
    return toPatient(summary, encounters);
  },
  balance: (id, signal) => patientBalance(id, signal),
  appointmentsOn: async (date, locationId, signal) => (await scheduleDay(date, locationId, signal)).map(toAppointment),
  appointmentDetail: async (id, signal) => toDetail(await appointmentSidebar(id, signal)),
};
