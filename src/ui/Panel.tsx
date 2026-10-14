import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ScheduleChoice, ScheduleInfo, Ui } from '../app.js';
import { STYLES } from './styles.js';

type Option = { label: string; detail?: string; value: unknown };
type State =
  | { kind: 'idle' }
  | { kind: 'working'; message: string; stop: (() => void) | undefined }
  | { kind: 'choose'; title: string; options: Option[]; resolve: (value: unknown) => void }
  | { kind: 'schedule'; info: ScheduleInfo; resolve: (choice: ScheduleChoice | null) => void }
  | { kind: 'done'; message: string; warnings: string[]; pdfUrl: string | undefined }
  | { kind: 'fail'; message: string };

/** What the floating button does on the page the user is on; null hides the button. */
export interface ButtonSpec {
  label: string;
  /** Called from the user's click, so it may open a tab. */
  run: (ui: Ui) => void | Promise<void>;
}

let state: State = { kind: 'idle' };
const listeners = new Set<() => void>();
const setState = (next: State) => {
  state = next;
  for (const l of listeners) l();
};

/** The real screen: reports into the panel above the button. */
export const panelUi: Ui = {
  working: (message, stop) => setState({ kind: 'working', message, stop }),
  choose: (title, options) =>
    new Promise((resolve) => setState({ kind: 'choose', title, options, resolve: resolve as (value: unknown) => void })),
  chooseSchedule: (info) => new Promise((resolve) => setState({ kind: 'schedule', info, resolve })),
  done: (message, warnings, pdfUrl) => setState({ kind: 'done', message, warnings, pdfUrl }),
  fail: (message) => setState({ kind: 'fail', message }),
};

export const isBusy = () => state.kind === 'working' || state.kind === 'choose' || state.kind === 'schedule';

function ScheduleChooser({ info, resolve }: { info: ScheduleInfo; resolve: (choice: ScheduleChoice | null) => void }) {
  const [picked, setPicked] = useState<string[]>(info.providers);
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));
  return (
    <>
      <p class="title">Routing Forms for {info.dateLabel}</p>
      <p>Which providers? Each gets a cover page, then their patients by time.</p>
      {info.providers.map((name) => (
        <label class="check">
          <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} /> {name}
        </label>
      ))}
      <button
        class="choice"
        disabled={picked.length === 0}
        onClick={() => resolve({ kind: 'providers', providers: info.providers.filter((n) => picked.includes(n)) })}
      >
        <strong>Print the selected providers</strong>
      </button>
      {info.openPatient && (
        <button class="choice" onClick={() => resolve({ kind: 'patient' })}>
          <strong>Print only {info.openPatient}</strong>
          <span>The appointment open in the right-hand panel.</span>
        </button>
      )}
      <button class="link" onClick={() => resolve(null)}>
        Cancel
      </button>
    </>
  );
}

function Panel({ spec }: { spec: ButtonSpec | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const rerender = () => tick((n) => n + 1);
    listeners.add(rerender);
    return () => void listeners.delete(rerender);
  }, []);
  const close = () => setState({ kind: 'idle' });

  return (
    <div class="wrap">
      {state.kind !== 'idle' && (
        <div class="panel" role="status">
          {state.kind === 'working' && (
            <>
              <p class="working">
                <span class="spin" /> {state.message}
              </p>
              {state.stop && (
                <button class="stop" onClick={state.stop}>
                  Stop
                </button>
              )}
            </>
          )}
          {state.kind === 'choose' && (
            <>
              <p class="title">{state.title}</p>
              {state.options.map((o) => (
                <button class="choice" onClick={() => (state.kind === 'choose' ? state.resolve(o.value) : undefined)}>
                  <strong>{o.label}</strong>
                  {o.detail && <span>{o.detail}</span>}
                </button>
              ))}
              <button class="link" onClick={() => (state.kind === 'choose' ? state.resolve(null) : undefined)}>
                Cancel
              </button>
            </>
          )}
          {state.kind === 'schedule' && <ScheduleChooser info={state.info} resolve={state.resolve} />}
          {state.kind === 'done' && (
            <>
              <p class="ok">{state.message}</p>
              {state.pdfUrl && (
                <p>
                  <a href={state.pdfUrl} target="_blank">
                    Open the PDF
                  </a>
                </p>
              )}
              {state.warnings.map((w) => (
                <p class="warn">{w}</p>
              ))}
              <button class="link" onClick={close}>
                Close
              </button>
            </>
          )}
          {state.kind === 'fail' && (
            <>
              <p class="err">{state.message}</p>
              <button class="link" onClick={close}>
                Close
              </button>
            </>
          )}
        </div>
      )}
      {spec && (
      <button class="fab" disabled={isBusy()} title="Print a pre-filled Routing Form" onClick={() => void spec.run(panelUi)}>
          {spec.label}
        </button>
      )}
    </div>
  );
}

const HOST_ID = 'rosebud-root';
let container: HTMLElement | null = null;

/** Shows (or updates) the floating button; call again whenever the page, and so the button, changes. */
export function showButton(spec: ButtonSpec | null): void {
  if (!container) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);
    container = document.createElement('div');
    shadow.appendChild(container);
  }
  render(<Panel spec={spec} />, container);
}
