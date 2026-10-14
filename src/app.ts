import { parseRfv } from './core/appointment.js';
import { dateLabel, firstLast, formatUsDate, formValues, sameDate } from './core/format.js';
import { buildPdf } from './core/pdf.js';
import { groupByProvider, type ScheduleEntry } from './core/schedule.js';
import type { CalendarDate, PrintPart } from './core/types.js';
import {
  appointmentDetail,
  knownScheduleLocationId,
  localWhen,
  nextAppointment,
  patientBalance,
  primaryLocationId,
  scheduleDay,
  startsOn,
  type DayAppointment,
} from './ehr/api.js';
import { readChart } from './ehr/chart.js';
import { providerColumns, scheduleDate } from './ehr/schedule.js';
import { readSidebar } from './ehr/sidebar.js';
import { currentForm } from './platform/formStore.js';
import { showPdf } from './platform/output.js';

export interface ScheduleInfo {
  dateLabel: string;
  providers: string[];
  /** The patient whose appointment is open in the right-hand panel, if any. */
  openPatient: string | null;
}
export type ScheduleChoice = { kind: 'providers'; providers: string[] } | { kind: 'patient' };

/** What the app needs from its screen; the real one is src/ui/Panel.tsx. */
export interface Ui {
  /** Shows progress; `stop`, when given, adds a Stop button that calls it. */
  working(message: string, stop?: () => void): void;
  choose<T>(title: string, options: { label: string; detail?: string; value: T }[]): Promise<T | null>;
  chooseSchedule(info: ScheduleInfo): Promise<ScheduleChoice | null>;
  done(message: string, warnings: string[], pdfUrl?: string): void;
  fail(message: string): void;
}

/** An error whose message is fit to show staff as it stands. */
export class UserError extends Error {}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const explain = (error: unknown): string =>
  isAbort(error)
    ? 'Stopped. Nothing was printed.'
    : error instanceof UserError
      ? error.message
      : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;

const todayDate = (): CalendarDate => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

/** A run's cancel switch, shared by every call it makes. */
function newRun(ui: Ui) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  return {
    signal: controller.signal,
    working: (message: string) => ui.working(message, stop),
  };
}

interface Appointment {
  provider: string; // "Last, First", or ''
  date: CalendarDate;
  time: string;
  examType: string;
  comments: string;
}

type Source = 'today' | 'next';

/**
 * Chart Mode (CONTEXT.md): one Routing Form for the patient whose chart is open. The
 * appointment is the chart's Next Appt, or, if Last Exam is today (the patient has been
 * checked in), the user chooses between today's appointment and the next one.
 */
export async function printFromChart(ui: Ui): Promise<void> {
  const run = newRun(ui);
  try {
    const chart = readChart();
    if (!chart) throw new UserError('The chart is still loading. Try again in a moment.');
    const now = todayDate();
    const checkedInToday = chart.lastExamDate !== null && sameDate(chart.lastExamDate, now);

    let source: Source;
    if (checkedInToday && chart.next) {
      const picked = await ui.choose<Source>('Which appointment is this form for?', [
        { label: "Today's appointment", detail: 'Already checked in; the time is looked up on today’s schedule.', value: 'today' },
        {
          label: 'The next appointment',
          detail: `${formatUsDate(chart.next.date)} at ${chart.next.time}${chart.next.examType ? ` — ${chart.next.examType}` : ''}`,
          value: 'next',
        },
      ]);
      if (!picked) {
        ui.fail('Cancelled. Nothing was printed.');
        return;
      }
      source = picked;
    } else if (checkedInToday) {
      source = 'today';
    } else if (chart.next) {
      source = 'next';
    } else {
      throw new UserError('This patient has no appointment to print a form for.');
    }

    run.working('Reading the appointment…');
    const warnings: string[] = [];
    const appointment = await findAppointment(source, chart.patientId, chart.chartName, now, run.signal, warnings);
    const fallback = source === 'next' ? chart.next : null;
    const date = appointment?.date ?? fallback?.date ?? now;
    const time = appointment?.time ?? fallback?.time ?? '';
    const examType = appointment?.examType ?? fallback?.examType ?? '';

    const values = formValues(
      { chartName: chart.chartName, dob: chart.dob, patientId: chart.patientId, patientBalance: chart.balance },
      { provider: appointment?.provider ?? '', date, time, examType, rfv: parseRfv(appointment?.comments) },
    );
    run.signal.throwIfAborted();
    const pdf = await buildPdf([{ kind: 'form', values }], (await currentForm()).assets, progress(run, 'Routing Forms completed'));
    const shown = showPdf(pdf);
    ui.done(shown.opened ? 'The Routing Form opened in a new tab.' : 'The forms are ready, but the browser blocked the new tab.', warnings, shown.opened ? undefined : shown.url);
  } catch (error) {
    ui.fail(explain(error));
  }
}

/** The appointment the form is for, with its Comments; null (and a warning) when it can't be found. */
async function findAppointment(
  source: Source,
  patientId: string,
  chartName: string,
  today: CalendarDate,
  signal: AbortSignal,
  warnings: string[],
): Promise<Appointment | null> {
  try {
    if (source === 'next') {
      const next = await nextAppointment(patientId, signal);
      if (!next) throw new Error('RevolutionEHR lists no next appointment.');
      const when = localWhen(next.startDate);
      const detail = await appointmentDetail(next.appointmentId, signal);
      const provider = next.provider ? `${next.provider.lastName.trim()}, ${next.provider.firstName.trim()}` : '';
      return { ...when, provider, examType: detail.template?.name ?? next.templateName, comments: detail.description ?? '' };
    }
    const location = await primaryLocationId(patientId, signal);
    const mine = (await scheduleDay(today, location, signal))
      .filter((a) => String(a.patientName.patientId) === patientId && startsOn(a.startDate, today))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const first = mine[0];
    if (!first) throw new Error(`${firstLast(chartName)} is not on today's schedule.`);
    const detail = await appointmentDetail(first.scheduleItemId, signal);
    return { ...localWhen(first.startDate), provider: providerLabel(first), examType: detail.template?.name ?? first.template, comments: detail.description ?? '' };
  } catch (error) {
    if (isAbort(error)) throw error;
    warnings.push(
      source === 'next'
        ? `Could not read the appointment's reason for visit (${error instanceof Error ? error.message : String(error)}); it is blank.`
        : `Could not find today's appointment (${error instanceof Error ? error.message : String(error)}); the time and reason are blank.`,
    );
    return null;
  }
}

interface DayItem extends ScheduleEntry {
  appointment: DayAppointment;
}

const providerLabel = (a: DayAppointment) => `${a.provider.lastName.trim()}, ${a.provider.firstName.trim()}`;
const chartNameOf = (a: DayAppointment) => `${a.patientName.lastName.trim()}, ${a.patientName.firstName.trim()}`;

function parseIsoDate(text: string | null): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text ?? '');
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/**
 * Schedule Mode (CONTEXT.md): Routing Forms for the date and providers on screen. The user
 * picks which providers (all patients of provider A by time, then provider B, each stack
 * behind its Provider Cover Page), or just the patient open in the right-hand panel.
 */
export async function printFromSchedule(ui: Ui): Promise<void> {
  const run = newRun(ui);
  try {
    const date = scheduleDate();
    const providers = providerColumns();
    if (!date || providers.length === 0) throw new UserError('The schedule is still loading. Try again in a moment.');
    const location = knownScheduleLocationId();
    if (location === null) throw new UserError("Click the schedule's refresh button (top right) once, then try again.");
    const open = readSidebar();
    const choice = await ui.chooseSchedule({ dateLabel: dateLabel(date), providers, openPatient: open ? firstLast(open.chartName) : null });
    if (!choice) {
      ui.fail('Cancelled. Nothing was printed.');
      return;
    }

    run.working('Reading the schedule…');
    const day = await scheduleDay(date, location, run.signal);
    const wanted =
      choice.kind === 'providers'
        ? day.filter((a) => choice.providers.includes(providerLabel(a)))
        : day.filter((a) => open && String(a.patientName.patientId) === open.patientId && localWhen(a.startDate).time === open.time);
    const entries: DayItem[] = wanted.map((a) => ({
      provider: providerLabel(a),
      time: localWhen(a.startDate).time,
      chartName: chartNameOf(a),
      patientId: String(a.patientName.patientId),
      appointment: a,
    }));
    const groups = groupByProvider<DayItem>(entries, providers);
    if (groups.length === 0) {
      throw new UserError(choice.kind === 'patient' ? 'That appointment is not on the schedule any more.' : 'None of the selected providers has patients on this day.');
    }

    const all = groups.flatMap((g) => g.entries);
    const warnings: string[] = [];
    let done = 0;
    const read = await mapLimit(all, 6, async (item) => {
      run.signal.throwIfAborted();
      const [detail, balance] = await Promise.all([
        appointmentDetail(item.appointment.scheduleItemId, run.signal).catch((e) => failed(e, `the reason for visit of ${firstLast(item.chartName)}`, warnings)),
        patientBalance(item.patientId, run.signal).catch((e) => failed(e, `the balance of ${firstLast(item.chartName)}`, warnings)),
      ]);
      run.working(`Gathering patient details: ${++done} of ${all.length}`);
      return { detail, balance };
    });

    run.signal.throwIfAborted();
    const examTypeOf = (item: DayItem) => read[all.indexOf(item)]?.detail?.template?.name ?? item.appointment.template;
    const formOf = new Map<DayItem, PrintPart>();
    all.forEach((item, i) => {
      const { detail, balance } = read[i]!;
      const dob = parseIsoDate(item.appointment.patientDob);
      if (!dob) warnings.push(`${firstLast(item.chartName)} has no date of birth in the schedule; D.O.B. and Age are blank on their form.`);
      formOf.set(item, {
        kind: 'form',
        values: formValues(
          { chartName: item.chartName, dob, patientId: item.patientId, patientBalance: balance === null ? null : String(balance) },
          { provider: item.provider, date, time: item.time, examType: examTypeOf(item), rfv: parseRfv(detail?.description) },
        ),
      });
    });

    const parts: PrintPart[] = [];
    for (const group of groups) {
      // One patient asked for from the open panel needs no cover page; a provider's stack always gets one.
      if (choice.kind === 'providers') {
        parts.push({
          kind: 'cover',
          cover: {
            provider: group.provider,
            dateLabel: dateLabel(date),
            rows: group.entries.map((i) => ({ time: i.time, name: firstLast(i.chartName), examType: examTypeOf(i) })),
          },
        });
      }
      for (const item of group.entries) parts.push(formOf.get(item)!);
    }

    const pdf = await buildPdf(parts, (await currentForm()).assets, progress(run, 'Routing Forms completed'));
    const shown = showPdf(pdf);
    const count = all.length;
    ui.done(
      shown.opened ? `${count} Routing ${count === 1 ? 'Form' : 'Forms'} opened in a new tab.` : 'The forms are ready, but the browser blocked the new tab.',
      warnings,
      shown.opened ? undefined : shown.url,
    );
  } catch (error) {
    ui.fail(explain(error));
  }
}

/** Progress for the PDF step: "Routing Forms completed: 3 of 12", repainted before the next form is drawn. */
function progress(run: { working(message: string): void }, label: string) {
  return async (done: number, total: number) => {
    run.working(`${label}: ${done} of ${total}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
}

/** A failed read becomes a warning and a missing value; stopping the run still stops it. */
function failed(error: unknown, what: string, warnings: string[]): null {
  if (isAbort(error)) throw error;
  warnings.push(`Could not read ${what} (${error instanceof Error ? error.message : String(error)}); it is blank.`);
  return null;
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
