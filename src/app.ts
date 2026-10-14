import { UserError, type RoutingForms, type ScheduleOffer, type Source } from './routingForms/index.js';
import { showPdf } from './platform/output.js';

export type ScheduleInfo = ScheduleOffer;
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

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const explain = (error: unknown): string =>
  isAbort(error)
    ? 'Stopped. Nothing was printed.'
    : error instanceof UserError
      ? error.message
      : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;

/** A run's cancel switch and progress, shared by everything it does. */
function newRun(ui: Ui) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  return {
    signal: controller.signal,
    /** Shows the message and lets the page repaint before the next step. */
    progress: async (message: string) => {
      ui.working(message, stop);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  };
}

/** Opens the PDF in a new tab and says so, or offers a link if the browser blocked the tab. */
function finish(ui: Ui, pdf: Uint8Array, opened: string, warnings: string[]): void {
  const shown = showPdf(pdf);
  ui.done(shown.opened ? opened : 'The forms are ready, but the browser blocked the new tab.', warnings, shown.opened ? undefined : shown.url);
}

/** Chart Mode (CONTEXT.md): one Routing Form for the patient whose chart is open. */
export async function printFromChart(ui: Ui, forms: RoutingForms): Promise<void> {
  const run = newRun(ui);
  try {
    await run.progress('Reading the chart…');
    const offer = await forms.offer('chart', run.signal);
    let source: Source | null = offer.sources[0]!;
    if (offer.sources.length > 1) {
      source = await ui.choose<Source>('Which appointment is this form for?', [
        { label: "Today's appointment", detail: 'Already checked in; the time is looked up on today’s schedule.', value: 'today' },
        { label: 'The next appointment', detail: offer.next ?? '', value: 'next' },
      ]);
    }
    if (!source) return ui.fail('Cancelled. Nothing was printed.');
    const printed = await forms.print({ mode: 'chart', source }, run);
    finish(ui, printed.pdf, 'The Routing Form opened in a new tab.', printed.warnings);
  } catch (error) {
    ui.fail(explain(error));
  }
}

/**
 * Schedule Mode (CONTEXT.md): Routing Forms for the date and providers on screen, or just
 * the patient open in the right-hand panel.
 */
export async function printFromSchedule(ui: Ui, forms: RoutingForms): Promise<void> {
  const run = newRun(ui);
  try {
    await run.progress('Reading the schedule…');
    const choice = await ui.chooseSchedule(await forms.offer('schedule', run.signal));
    if (!choice) return ui.fail('Cancelled. Nothing was printed.');
    const printed = await forms.print(
      choice.kind === 'providers' ? { mode: 'schedule', providers: choice.providers } : { mode: 'schedule', openPatient: true },
      run,
    );
    const n = printed.count;
    finish(ui, printed.pdf, `${n} Routing ${n === 1 ? 'Form' : 'Forms'} opened in a new tab.`, printed.warnings);
  } catch (error) {
    ui.fail(explain(error));
  }
}
