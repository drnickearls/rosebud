/**
 * Routing Forms (CONTEXT.md): everything between "the user pressed the button" and "here is
 * the PDF". It reads RevolutionEHR only through the Ehr port, so it can be tested with an
 * in-memory fake; it never touches the page, opens tabs or shows anything itself.
 *
 *   offer(mode)  what the user may choose from, read from the screen and RevolutionEHR
 *   print(choice) the finished PDF, its parts, and any warnings
 *
 * Inside, a print is planned first (which visits, in what order, with what facts) and then
 * drawn, so tests can check the plan's parts without reading PDFs.
 */

import { cleanExamType, parseRfv } from '../core/appointment.js';
import { dateLabel, firstLast, formatUsDate, formValues, sameDate, timeToMinutes } from '../core/format.js';
import { buildPdf, type FormAssets } from '../core/pdf.js';
import { groupByProvider } from '../core/schedule.js';
import type { CalendarDate, PrintPart } from '../core/types.js';
import type { Appointment, AppointmentDetail, Ehr } from './ehr.js';

export type { Ehr } from './ehr.js';

/** An error whose message is fit to show staff as it stands. */
export class UserError extends Error {}

/** Which appointment a Chart Mode form is for: today's (the patient is checked in) or the next one. */
export type Source = 'today' | 'next';

export interface ChartOffer {
  /** One source, or both (today's first) when the user must choose. */
  sources: Source[];
  /** "12/25/2026 at 9:00 AM — Long Medical", for the chooser; null when there is no next appointment. */
  next: string | null;
}

export interface ScheduleOffer {
  dateLabel: string;
  /** The provider columns on screen, left to right. */
  providers: string[];
  /** "Harry Potter" when an appointment is open in the right-hand panel, else null. */
  openPatient: string | null;
}

export type PrintChoice =
  | { mode: 'chart'; source: Source }
  | { mode: 'schedule'; providers: string[] }
  | { mode: 'schedule'; openPatient: true };

export interface PrintOptions {
  signal: AbortSignal;
  /** Progress for the screen; awaited, so the caller can let the page repaint. */
  progress?: (message: string) => void | Promise<void>;
}

export interface Printed {
  pdf: Uint8Array;
  parts: PrintPart[];
  /** Routing Forms printed (cover pages not counted). */
  count: number;
  warnings: string[];
}

export interface RoutingForms {
  offer(mode: 'chart', signal: AbortSignal): Promise<ChartOffer>;
  offer(mode: 'schedule', signal: AbortSignal): Promise<ScheduleOffer>;
  print(pick: PrintChoice, options: PrintOptions): Promise<Printed>;
}

export interface RoutingFormsDeps {
  ehr: Ehr;
  /** The form in use: the saved custom form, or the built-in one. */
  form: () => Promise<{ assets: FormAssets }>;
  /** Today on the PC's clock. */
  now: () => CalendarDate;
}

const NO_APPOINTMENT = 'This patient has no appointment to print a form for.';

/** Concurrent requests while gathering a day's details. */
const IN_FLIGHT = 6;

/**
 * Statuses of appointments that are not on the schedule screen: found by comparing a day's
 * service list with its Agenda on screen (2, 5 and 6 never appear there; 0 scheduled and 3
 * completed do). Anything else is kept, so an unfamiliar "arrived" status can't drop a patient.
 */
const HIDDEN_STATUSES = new Set([2, 5, 6]);

/** One Routing Form's facts. */
interface Visit {
  patientId: string;
  chartName: string;
  dob: CalendarDate | null;
  balance: number | null;
  provider: string;
  date: CalendarDate;
  time: string;
  examType: string;
  rfv: string | null;
}

/** What will be printed: groups in order, each optionally behind a Provider Cover Page. */
interface Plan {
  groups: { provider: string; cover: boolean; visits: Visit[] }[];
  /** Warnings for the user: what could not be read and is blank. */
  notes: string[];
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const byTime = (a: Appointment, b: Appointment) => (timeToMinutes(a.time) ?? 0) - (timeToMinutes(b.time) ?? 0);

/** The appointments the schedule screen shows on a day. */
const shownOn = (day: Appointment[], date: CalendarDate) => day.filter((a) => !HIDDEN_STATUSES.has(a.status) && sameDate(a.date, date));

/** A failed read becomes a note and a missing value; stopping the run still stops it. */
function blankIfFailed<T>(read: Promise<T>, what: string, notes: string[]): Promise<T | null> {
  return read.catch((error: unknown) => {
    if (isAbort(error)) throw error;
    notes.push(`Could not read ${what} (${reasonOf(error)}); it is blank.`);
    return null;
  });
}

export function createRoutingForms({ ehr, form, now }: RoutingFormsDeps): RoutingForms {
  function chartPatient(): string {
    const id = ehr.screen.patientId();
    if (!id) throw new UserError("Open the patient's chart, then try again.");
    return id;
  }

  function scheduleOnScreen() {
    const screen = ehr.screen.schedule();
    if (!screen) throw new UserError('The schedule is still loading. Try again in a moment.');
    if (screen.locationId === null) throw new UserError("Click the schedule's refresh button (top right) once, then try again.");
    return { ...screen, locationId: screen.locationId };
  }

  async function offerChart(signal: AbortSignal): Promise<ChartOffer> {
    const patient = await ehr.patient(chartPatient(), signal);
    const checkedIn = patient.lastExam !== null && sameDate(patient.lastExam, now());
    const sources: Source[] = [];
    if (checkedIn) sources.push('today');
    if (patient.next) sources.push('next');
    if (sources.length === 0) throw new UserError(NO_APPOINTMENT);
    const n = patient.next;
    const examType = n ? cleanExamType(n.examType) : '';
    return { sources, next: n ? `${formatUsDate(n.date)} at ${n.time}${examType ? ` — ${examType}` : ''}` : null };
  }

  async function offerSchedule(signal: AbortSignal): Promise<ScheduleOffer> {
    const screen = scheduleOnScreen();
    const open = ehr.screen.openAppointment();
    let openPatient: string | null = null;
    if (open) {
      const day = shownOn(await ehr.appointmentsOn(screen.date, screen.locationId, signal), screen.date);
      const found = day.find((a) => a.patientId === open.patientId && a.time === open.time);
      if (found) openPatient = firstLast(found.chartName);
    }
    return { dateLabel: dateLabel(screen.date), providers: screen.providers, openPatient };
  }

  /** Chart Mode: one form, for today's appointment or the next one. Read afresh; an earlier offer is not trusted. */
  async function planChart(source: Source, { signal, progress }: PrintOptions): Promise<Plan> {
    const id = chartPatient();
    await progress?.('Reading the appointment…');
    const notes: string[] = [];
    const today = now();
    const [patient, balance] = await Promise.all([ehr.patient(id, signal), blankIfFailed(ehr.balance(id, signal), 'the balance', notes)]);
    const name = firstLast(patient.chartName);

    let visit: Pick<Visit, 'provider' | 'date' | 'time' | 'examType' | 'rfv'>;
    if (source === 'next') {
      const next = patient.next;
      if (!next) throw new UserError(NO_APPOINTMENT);
      const detail = await blankIfFailed(ehr.appointmentDetail(next.id, signal), "the appointment's reason for visit", notes);
      visit = { provider: next.provider, date: next.date, time: next.time, examType: detail?.examType ?? next.examType, rfv: parseRfv(detail?.comments) };
    } else {
      const first = await todaysAppointment(id, name, patient.primaryLocationId, today, signal, notes);
      const detail = first && (await blankIfFailed(ehr.appointmentDetail(first.id, signal), 'the reason for visit', notes));
      visit = first
        ? { provider: first.provider, date: today, time: first.time, examType: detail?.examType ?? first.examType, rfv: parseRfv(detail?.comments) }
        : { provider: '', date: today, time: '', examType: '', rfv: null };
    }

    if (!patient.dob) notes.push(`${name} has no date of birth in RevolutionEHR; D.O.B. and Age are blank on the form.`);
    return {
      groups: [{ provider: visit.provider, cover: false, visits: [{ patientId: id, chartName: patient.chartName, dob: patient.dob, balance, ...visit }] }],
      notes,
    };
  }

  /** The patient's earliest appointment on today's schedule, at their primary location; null (and a note) when it can't be found. */
  async function todaysAppointment(
    id: string,
    name: string,
    locationId: number | null,
    today: CalendarDate,
    signal: AbortSignal,
    notes: string[],
  ): Promise<Appointment | null> {
    try {
      if (locationId === null) throw new Error("the patient has no primary location, so today's schedule can't be looked up");
      const mine = shownOn(await ehr.appointmentsOn(today, locationId, signal), today).filter((a) => a.patientId === id);
      const first = mine.sort(byTime)[0];
      if (!first) throw new Error(`${name} is not on today's schedule`);
      return first;
    } catch (error) {
      if (isAbort(error)) throw error;
      notes.push(`Could not find today's appointment (${reasonOf(error)}); the time and reason are blank.`);
      return null;
    }
  }

  /** Schedule Mode: the chosen providers' patients (or the open appointment's), for the day on screen. */
  async function planSchedule(pick: Exclude<PrintChoice, { mode: 'chart' }>, { signal, progress }: PrintOptions): Promise<Plan> {
    const screen = scheduleOnScreen();
    const byProvider = 'providers' in pick;
    const open = byProvider ? null : ehr.screen.openAppointment();
    if (!byProvider && !open) throw new UserError('Open the appointment on the schedule, then try again.');

    await progress?.('Reading the schedule…');
    const day = shownOn(await ehr.appointmentsOn(screen.date, screen.locationId, signal), screen.date);
    const wanted = byProvider
      ? day.filter((a) => pick.providers.includes(a.provider))
      : day.filter((a) => a.patientId === open!.patientId && a.time === open!.time);
    const groups = groupByProvider(wanted, screen.providers);
    if (groups.length === 0) {
      throw new UserError(byProvider ? 'None of the selected providers has patients on this day.' : 'That appointment is not on the schedule any more.');
    }

    const all = groups.flatMap((g) => g.entries);
    const notes: string[] = [];
    let done = 0;
    const read = await mapLimit(all, IN_FLIGHT, async (a) => {
      signal.throwIfAborted();
      const name = firstLast(a.chartName);
      const [detail, balance] = await Promise.all([
        blankIfFailed<AppointmentDetail>(ehr.appointmentDetail(a.id, signal), `the reason for visit of ${name}`, notes),
        blankIfFailed(ehr.balance(a.patientId, signal), `the balance of ${name}`, notes),
      ]);
      await progress?.(`Gathering patient details: ${++done} of ${all.length}`);
      return { detail, balance };
    });

    const visitOf = new Map<Appointment, Visit>();
    all.forEach((a, i) => {
      const { detail, balance } = read[i]!;
      if (!a.dob) notes.push(`${firstLast(a.chartName)} has no date of birth in the schedule; D.O.B. and Age are blank on their form.`);
      visitOf.set(a, {
        patientId: a.patientId,
        chartName: a.chartName,
        dob: a.dob,
        balance,
        provider: a.provider,
        date: screen.date,
        time: a.time,
        examType: detail?.examType ?? a.examType,
        rfv: parseRfv(detail?.comments),
      });
    });
    // One patient asked for from the open panel needs no cover page; a provider's stack always gets one.
    return { groups: groups.map((g) => ({ provider: g.provider, cover: byProvider, visits: g.entries.map((a) => visitOf.get(a)!) })), notes };
  }

  /** The plan as printed parts: each group's cover page (if any), then its forms. */
  function partsOf(plan: Plan): PrintPart[] {
    return plan.groups.flatMap((group): PrintPart[] => {
      const forms = group.visits.map(
        (v): PrintPart => ({
          kind: 'form',
          values: formValues(
            { chartName: v.chartName, dob: v.dob, patientId: v.patientId, patientBalance: v.balance === null ? null : String(v.balance) },
            { provider: v.provider, date: v.date, time: v.time, examType: cleanExamType(v.examType), rfv: v.rfv },
          ),
        }),
      );
      if (!group.cover) return forms;
      const first = group.visits[0]!;
      const cover: PrintPart = {
        kind: 'cover',
        cover: {
          provider: group.provider,
          dateLabel: dateLabel(first.date),
          rows: group.visits.map((v) => ({ time: v.time, name: firstLast(v.chartName), examType: cleanExamType(v.examType) })),
        },
      };
      return [cover, ...forms];
    });
  }

  return {
    offer: ((mode: 'chart' | 'schedule', signal: AbortSignal) => (mode === 'chart' ? offerChart(signal) : offerSchedule(signal))) as RoutingForms['offer'],

    async print(pick, options) {
      const plan = pick.mode === 'chart' ? await planChart(pick.source, options) : await planSchedule(pick, options);
      options.signal.throwIfAborted();
      const parts = partsOf(plan);
      const count = parts.filter((p) => p.kind === 'form').length;
      const { assets } = await form();
      const pdf = await buildPdf(parts, assets, async (done, total) => {
        options.signal.throwIfAborted();
        await options.progress?.(`Routing Forms completed: ${done} of ${total}`);
      });
      return { pdf, parts, count, warnings: plan.notes };
    },
  };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping the order of the results. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
