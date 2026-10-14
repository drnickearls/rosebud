import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { bundledAssets } from '../core/assets.js';
import { FIELD_KEYS, FIELD_LABELS, SAMPLE_VALUES, inspectBlankPdf, parsePackage, stringifyPackage } from '../core/form.js';
import { buildPdf } from '../core/pdf.js';
import {
  addField,
  applySuggestions,
  assetsOf,
  boxOf,
  dragTo,
  dragWidth,
  draftOf,
  isArrow,
  nudge,
  removeField,
  resize,
  toggleBold,
  unplaced as unplacedOf,
  type Arrow,
  type Draft,
  type Key,
  type PageSize,
  type Placed,
} from '../formEditor/index.js';
import { chromeFormStorage } from '../savedForm/chromeStorage.js';
import { createSavedForm } from '../savedForm/index.js';
import { openFormPage, type FormPage } from './pdfView.js';

type Message = { kind: 'ok' | 'error'; text: string } | null;

/** Screen pixels per PDF point. */
const SCALE = 1.3;
const LETTER: PageSize = { width: 612, height: 792 };

const savedForm = createSavedForm(chromeFormStorage);

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function App() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [custom, setCustom] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<Key | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [page, setPage] = useState<FormPage | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The form in use when the page opens.
  useEffect(() => {
    void savedForm.load().then((loaded) => {
      setCustom(loaded.custom);
      if (loaded.problem) setMessage({ kind: 'error', text: loaded.problem.replace(' was used', ' is shown') });
      setDraft(draftOf(loaded.assets));
    });
  }, []);

  // Draw the blank form whenever its PDF changes.
  const pdfBytes = draft?.blankPdf;
  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;
    let opened: FormPage | null = null;
    openFormPage(pdfBytes).then(
      (p) => {
        opened = p;
        if (cancelled) return p.destroy();
        setPage(p);
      },
      () => setMessage({ kind: 'error', text: "That PDF couldn't be shown." }),
    );
    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [pdfBytes]);
  useEffect(() => {
    if (page && canvas.current) void page.draw(canvas.current, SCALE);
  }, [page]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!draft) return <p class="loading">Loading&hellip;</p>;

  const size: PageSize = page ?? LETTER;
  const edit = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
    setConfirmReset(false);
  };
  const attempt = async (work: () => Promise<void> | void) => {
    try {
      await work();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const onFile = (input: HTMLInputElement) =>
    attempt(async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (/\.pdf$/i.test(file.name)) {
        const blankPdf = new Uint8Array(await file.arrayBuffer());
        await inspectBlankPdf(blankPdf);
        edit({ ...draft, blankPdf });
        setMessage({ kind: 'ok', text: 'New blank form loaded. Click "Suggest positions" to place the boxes by the form\'s labels, then drag each box onto its blank.' });
      } else {
        const assets = await parsePackage(await file.text());
        edit(draftOf(assets));
        setMessage({ kind: 'ok', text: `Loaded "${assets.template.name}". Try Test print, then Save.` });
      }
    });

  const suggest = () =>
    attempt(async () => {
      if (!page) return;
      const result = applySuggestions(draft, await page.suggest());
      edit(result.draft);
      setMessage({ kind: 'ok', text: `Placed ${result.placed} boxes by their labels. Drag any that are off, then Test print.` });
    });

  const testPrint = () =>
    attempt(async () => {
      const pdf = await buildPdf([{ kind: 'form', values: SAMPLE_VALUES }], assetsOf(draft));
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
      if (!window.open(url, '_blank')) setMessage({ kind: 'error', text: 'The browser blocked the new tab. Allow pop-ups for this page and try again.' });
    });

  const save = () =>
    attempt(async () => {
      await savedForm.save(assetsOf(draft));
      setCustom(true);
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Saved. New Routing Forms use this form from now on.' });
    });

  const exportForm = () =>
    attempt(() => {
      const assets = assetsOf(draft);
      download(`${assets.template.name.replace(/[^\w.-]+/g, '-')}.rosebud-form.json`, stringifyPackage(assets));
    });

  const builtIn = () =>
    attempt(async () => {
      if (!confirmReset && custom) {
        setConfirmReset(true);
        return;
      }
      await savedForm.reset();
      setDraft(draftOf(bundledAssets));
      setCustom(false);
      setDirty(false);
      setConfirmReset(false);
      setSelected(null);
      setMessage({ kind: 'ok', text: 'Back to the form built into Rosebud.' });
    });

  const unplaced = unplacedOf(draft);
  const sel = selected ? draft.fields[selected] : undefined;

  return (
    <div class="page">
      <header>
        <h1>Rosebud &mdash; Routing Form</h1>
        <p class="sub">{custom ? 'A form saved on this computer is in use.' : 'The form built into Rosebud is in use.'}</p>
      </header>

      <div class="toolbar">
        <label class="name">
          Form name
          <input type="text" value={draft.name} onInput={(e) => edit({ ...draft, name: (e.target as HTMLInputElement).value })} />
        </label>
        <FileButton accept=".pdf,application/pdf" onPick={onFile}>
          Choose a new blank form (PDF)&hellip;
        </FileButton>
        <button class="btn" onClick={() => void suggest()} disabled={!page}>
          Suggest positions
        </button>
        <FileButton accept=".json,application/json" onPick={onFile}>
          Load a form file&hellip;
        </FileButton>
        <button class="btn" onClick={() => void exportForm()}>
          Export
        </button>
      </div>

      <div class="toolbar">
        <button class="btn primary" onClick={() => void testPrint()}>
          Test print
        </button>
        <button class="btn" disabled={!dirty} onClick={() => void save()}>
          Save
        </button>
        <button class="btn danger" onClick={() => void builtIn()}>
          {confirmReset ? 'Click again to delete the saved form' : 'Use the built-in form'}
        </button>
        {dirty && <span class="dirty">Unsaved changes</span>}
      </div>
      {message && <p class={message.kind === 'ok' ? 'ok' : 'err'}>{message.text}</p>}

      <div class="work">
        <div class="stage" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div class="sheet" style={{ width: size.width * SCALE, height: size.height * SCALE }}>
            <canvas ref={canvas} />
            {page &&
              FIELD_KEYS.map((key) => {
                const f = draft.fields[key];
                return f ? (
                  <FieldBox
                    key={key}
                    name={key}
                    field={f}
                    page={page}
                    selected={selected === key}
                    onSelect={() => setSelected(key)}
                    onDrag={(from, dx, dy) => edit(dragTo(draft, key, from, dx, dy, page, SCALE))}
                    onWiden={(fromWidth, dx) => edit(dragWidth(draft, key, fromWidth, dx, SCALE))}
                    onArrow={(arrow, big) => edit(nudge(draft, key, arrow, big, page))}
                  />
                ) : null;
              })}
          </div>
        </div>

        <aside>
          <h2>Fields</h2>
          <p class="help">Drag a box onto its blank on the form. Drag a box's right edge to set how long the text can get before it shrinks.</p>
          {sel && selected ? (
            <div class="card">
              <strong>{FIELD_LABELS[selected]}</strong>
              <div class="line">
                <span>Text size</span>
                <button class="btn small" onClick={() => edit(resize(draft, selected, -0.5))}>
                  A&minus;
                </button>
                <span class="num">{sel.size}</span>
                <button class="btn small" onClick={() => edit(resize(draft, selected, 0.5))}>
                  A+
                </button>
              </div>
              <label class="line">
                <input type="checkbox" checked={!!sel.bold} onChange={() => edit(toggleBold(draft, selected))} />
                <span>Bold</span>
              </label>
              <div class="line">
                <span>Arrow keys nudge the selected box (Shift = bigger steps).</span>
              </div>
              <button
                class="btn small"
                onClick={() => {
                  edit(removeField(draft, selected));
                  setSelected(null);
                }}
              >
                Take this field off the form
              </button>
            </div>
          ) : (
            <p class="help">Click a box to select it.</p>
          )}
          {unplaced.length > 0 && (
            <>
              <h3>Not on the form</h3>
              <p class="help">Click one to add it to the middle of the page, then drag it into place.</p>
              <div class="chips">
                {unplaced.map((key) => (
                  <button
                    class="chip"
                    onClick={() => {
                      edit(addField(draft, key, size));
                      setSelected(key);
                    }}
                  >
                    + {FIELD_LABELS[key]}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function FileButton({ accept, onPick, children }: { accept: string; onPick: (input: HTMLInputElement) => void; children: ComponentChildren }) {
  return (
    <label class="btn">
      {children}
      <input type="file" accept={accept} hidden onChange={(e) => onPick(e.target as HTMLInputElement)} />
    </label>
  );
}

interface BoxProps {
  name: Key;
  field: Placed;
  page: PageSize;
  selected: boolean;
  onSelect: () => void;
  /** A drag that started with the field at `from`, now (dx, dy) screen pixels away. */
  onDrag: (from: { x: number; y: number }, dx: number, dy: number) => void;
  /** A drag of the right-edge grip that started at `fromWidth` points, now dx screen pixels away. */
  onWiden: (fromWidth: number, dx: number) => void;
  onArrow: (arrow: Arrow, big: boolean) => void;
}

/** A field drawn over the form with its sample text; dragged to move, its right edge dragged to set the width. */
function FieldBox({ name, field, page, selected, onSelect, onDrag, onWiden, onArrow }: BoxProps) {
  const box = boxOf(name, field, page, SCALE);
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; x: number; y: number; width: number } | null>(null);

  const start = (mode: 'move' | 'resize') => (e: PointerEvent) => {
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, x: field.x, y: field.y, width: box.widthPt };
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'move') onDrag({ x: d.x, y: d.y }, e.clientX - d.px, e.clientY - d.py);
    else onWiden(d.width, e.clientX - d.px);
  };
  const end = () => {
    drag.current = null;
  };
  const key = (e: KeyboardEvent) => {
    if (!isArrow(e.key)) return;
    e.preventDefault();
    onArrow(e.key, e.shiftKey);
  };

  return (
    <div
      class={`box${selected ? ' selected' : ''}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      tabIndex={0}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onKeyDown={key}
      onFocus={onSelect}
      title={FIELD_LABELS[name]}
    >
      <span class="tag">{FIELD_LABELS[name]}</span>
      <span class="sample" style={{ fontSize: box.fontSize, lineHeight: 1, fontWeight: field.bold ? 700 : 400 }}>
        {box.text}
      </span>
      <span class="grip" onPointerDown={start('resize')} onPointerMove={move} onPointerUp={end} title="Drag to set the maximum width" />
    </div>
  );
}
