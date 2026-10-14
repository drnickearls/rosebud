import type { CalendarDate } from '../core/types.js';

/**
 * What Routing Forms needs from RevolutionEHR, in its own terms (not URLs). The production
 * adapter is src/ehr/revolution.ts; tests use the in-memory test/fakeEhr.ts. Every time here
 * is already on the PC's clock: "9:00 PM" on a local date.
 */
export interface Ehr {
  /** What the user has on screen right now. Read again at every print, never cached. */
  screen: {
    /** The patient whose chart is open, or null on any other page. */
    patientId(): string | null;
    /** The schedule on screen, or null while it loads (or on another page). */
    schedule(): ScheduleScreen | null;
    /** The appointment open in the schedule's right-hand panel, or null. */
    openAppointment(): { patientId: string; time: string } | null;
  };
  patient(id: string, signal: AbortSignal): Promise<Patient>;
  /** Patient Balance in dollars (CONTEXT.md, "Balance Due"). */
  balance(id: string, signal: AbortSignal): Promise<number>;
  /** Every appointment on a day at a location, whatever its status (free slots and busy time left out). */
  appointmentsOn(date: CalendarDate, locationId: number, signal: AbortSignal): Promise<Appointment[]>;
  appointmentDetail(id: number, signal: AbortSignal): Promise<AppointmentDetail>;
}

export interface ScheduleScreen {
  date: CalendarDate;
  /** The provider columns, left to right, "Last, First". */
  providers: string[];
  /** The location the schedule is showing; null until the schedule has been seen loading its day. */
  locationId: number | null;
}

export interface Patient {
  chartName: string; // "Potter, Albus"
  dob: CalendarDate | null;
  /** The Last Exam date; today's when the patient has been checked in today. */
  lastExam: CalendarDate | null;
  next: NextAppointment | null;
  primaryLocationId: number | null;
}

export interface NextAppointment {
  id: number;
  date: CalendarDate;
  time: string; // "9:00 PM"
  examType: string;
  provider: string; // "Last, First", or '' when not given
}

export interface Appointment {
  id: number;
  patientId: string;
  chartName: string; // "Potter, Albus"
  dob: CalendarDate | null;
  provider: string; // "Last, First", as the schedule's column header shows it
  date: CalendarDate;
  time: string; // "9:00 PM"
  status: number;
  examType: string;
}

export interface AppointmentDetail {
  examType: string | null;
  /** The Comments box, where staff type "RFV: …". */
  comments: string;
}
