import type { CalendarDate } from '../src/core/types.js';
import type { Appointment, AppointmentDetail, Ehr, Patient, ScheduleScreen } from '../src/routingForms/ehr.js';

/**
 * An in-memory RevolutionEHR for tests: fixtures in, calls recorded. Every call is async,
 * honours its AbortSignal and can be made to fail. Fixtures use made-up patients only (the
 * repo is public).
 */
export interface FakeData {
  patients?: Record<string, Patient>;
  balances?: Record<string, number>;
  /** Keyed by `dayKey(date, locationId)`. */
  days?: Record<string, Appointment[]>;
  details?: Record<number, AppointmentDetail>;
}

export const dayKey = (d: CalendarDate, locationId: number) => `${d.year}-${d.month}-${d.day}@${locationId}`;

export class FakeEhr implements Ehr {
  /** What is on screen; tests set these directly. */
  onScreen: {
    patientId: string | null;
    schedule: ScheduleScreen | null;
    openAppointment: { patientId: string; time: string } | null;
  } = { patientId: null, schedule: null, openAppointment: null };

  /** Every call made, e.g. "balance 117821028", in order. */
  readonly calls: string[] = [];
  /** A call named here (e.g. "balance 117821028") throws this error instead of answering. */
  readonly failures = new Map<string, Error>();
  /** Runs at the start of every call, e.g. to press Stop part way through. */
  onCall: (call: string) => void = () => {};
  /** The most calls that were waiting for an answer at once. */
  maxInFlight = 0;
  private inFlight = 0;

  constructor(private readonly data: FakeData = {}) {}

  readonly screen = {
    patientId: () => this.onScreen.patientId,
    schedule: () => this.onScreen.schedule,
    openAppointment: () => this.onScreen.openAppointment,
  };

  private async answer<T>(call: string, signal: AbortSignal, value: () => T | undefined): Promise<T> {
    this.calls.push(call);
    this.onCall(call);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 1));
      signal.throwIfAborted();
      const failure = this.failures.get(call);
      if (failure) throw failure;
      const found = value();
      if (found === undefined) throw new Error(`RevolutionEHR answered 404 to ${call}.`);
      return found;
    } finally {
      this.inFlight--;
    }
  }

  patient(id: string, signal: AbortSignal) {
    return this.answer(`patient ${id}`, signal, () => this.data.patients?.[id]);
  }

  balance(id: string, signal: AbortSignal) {
    return this.answer(`balance ${id}`, signal, () => this.data.balances?.[id]);
  }

  appointmentsOn(date: CalendarDate, locationId: number, signal: AbortSignal) {
    const key = dayKey(date, locationId);
    return this.answer(`day ${key}`, signal, () => this.data.days?.[key] ?? []);
  }

  appointmentDetail(id: number, signal: AbortSignal) {
    return this.answer(`detail ${id}`, signal, () => this.data.details?.[id]);
  }
}
