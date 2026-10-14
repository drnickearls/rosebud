import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { bundledAssets } from '../core/assets.js';
import { FIELD_KEYS, FIELD_LABELS, SAMPLE_VALUES, inspectBlankPdf, parsePackage, stringifyPackage, validateTemplate } from '../core/form.js';
import { buildPdf, type FormAssets, type TemplateField } from '../core/pdf.js';
import type { FormValues } from '../core/types.js';
import { clearSavedForm, saveFormText, savedFormText } from './store.js';
import { openFormPage, type FormPage } from './pdfView.js';

type Key = keyof FormValues;
interface Placed {
  x: number;
  y: number;
  size: number;
  maxWidth?: number;
}
interface Draft {
  name: string;
  blankPdf: Uint8Array;
  fields: Partial<Record<Key, Placed>>;
}
type Message = { kind: 'ok' | 'error'; text: string } | null;

/** Screen pixels per PDF point. */
const SCALE = 1.3;
const SNAP = 0.5;
const snap = (n: number) => Math.round(n / SNAP) * SNAP;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const ctx = document.createElement('canvas').getContext('2d')!;
const textWidth = (text: string, size: number) => {
  ctx.font = `${size}px Helvetica, Arial, sans-serif`;
  return ctx.measureText(text).width;
};
/** The same shrink-to-fit rule the PDF uses (src/core/pdf.ts), so the preview matches the print. */
function fitSize(text: string, size: number, maxWidth?: number): number {
  let s = size;
  if (maxWidth) while (s > 6 && textWidth(text, s) > maxWidth) s -= 0.5;
  return s;
}

function draftOf(assets: FormAssets): Draft {
  const fields: Draft['fields'] = {};
  for (const f of assets.template.fields) {
    const placed: Placed = { x: f.x, y: f.y, size: f.size ?? 10 };
    if (f.maxWidth !== undefined) placed.maxWidth = f.maxWidth;
    fields[f.key] = placed;
  }
  return { name: assets.template.name, blankPdf: assets.blankPdf, fields };
}

function assetsOf(draft: Draft): FormAssets {
  const fields: TemplateField[] = FIELD_KEYS.flatMap((key) => {
    const p = draft.fields[key];
    if (!p) return [];
    const f: TemplateField = { key, x: p.x, y: p.y, size: p.size };
    if (p.maxWidth !== undefined) f.maxWidth = p.maxWidth;
    return [f];
  });
  return { blankPdf: draft.blankPdf, template: validateTemplate({ name: draft.name, fields }) };
}

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
    void (async () => {
      let assets: FormAssets = bundledAssets;
      try {
        const text = await savedFormText();
        if (text) {
          assets = await parsePackage(text);
          setCustom(true);
        }
      } catch {
        setMessage({ kind: 'error', text: 'The saved form could not be read, so the built-in form is shown.' });
      }
      setDraft(draftOf(assets));
    })();
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

  const edit = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
    setConfirmReset(false);
  };
  const setField = (key: Key, patch: Partial<Placed> | null) => {
    const fields = { ...draft.fields };
    if (patch === null) delete fields[key];
    else {
      const current = fields[key] ?? { x: 100, y: 400, size: 10 };
      const merged: Placed = { ...current, ...patch };
      if (patch.maxWidth === undefined && 'maxWidth' in patch) delete merged.maxWidth;
      fields[key] = merged;
    }
    edit({ ...draft, fields });
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
      const found = await page.suggest();
      const keys = Object.keys(found) as Key[];
      if (keys.length === 0) throw new Error("Couldn't find the form's labels (Date, Name, D.O.B. ...). Drag the boxes into place by hand.");
      const fields = { ...draft.fields };
      for (const key of keys) fields[key] = { size: 10, ...fields[key], x: found[key]!.x, y: found[key]!.y };
      edit({ ...draft, fields });
      setMessage({ kind: 'ok', text: `Placed ${keys.length} boxes by their labels. Drag any that are off, then Test print.` });
    });

  const testPrint = () =>
    attempt(async () => {
      const pdf = await buildPdf([{ kind: 'form', values: SAMPLE_VALUES }], assetsOf(draft));
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
      if (!window.open(url, '_blank')) setMessage({ kind: 'error', text: 'The browser blocked the new tab. Allow pop-ups for this page and try again.' });
    });

  const save = () =>
    attempt(async () => {
      await saveFormText(stringifyPackage(assetsOf(draft)));
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
      await clearSavedForm();
      setDraft(draftOf(bundledAssets));
      setCustom(false);
      setDirty(false);
      setConfirmReset(false);
      setSelected(null);
      setMessage({ kind: 'ok', text: 'Back to the form built into Rosebud.' });
    });

  const unplaced = FIELD_KEYS.filter((k) => !draft.fields[k]);
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
          <div class="sheet" style={{ width: page ? page.width * SCALE : 612 * SCALE, height: page ? page.height * SCALE : 792 * SCALE }}>
            <canvas ref={canvas} />
            {page &&
              FIELD_KEYS.map((key) => {
                const f = draft.fields[key];
                return f ? (
                  <FieldBox
                    key={key}
                    name={key}
                    field={f}
                    selected={selected === key}
                    pageHeight={page.height}
                    pageWidth={page.width}
                    onSelect={() => setSelected(key)}
                    onChange={(patch) => setField(key, patch)}
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
                <button class="btn small" onClick={() => setField(selected, { size: Math.max(6, sel.size - 0.5) })}>
                  A&minus;
                </button>
                <span class="num">{sel.size}</span>
                <button class="btn small" onClick={() => setField(selected, { size: Math.min(24, sel.size + 0.5) })}>
                  A+
                </button>
              </div>
              <div class="line">
                <span>Arrow keys nudge the selected box (Shift = bigger steps).</span>
              </div>
              <button
                class="btn small"
                onClick={() => {
                  setField(selected, null);
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
                      setField(key, { x: snap((page?.width ?? 612) * 0.3), y: snap((page?.height ?? 792) * 0.5), size: 10 });
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
  selected: boolean;
  pageHeight: number;
  pageWidth: number;
  onSelect: () => void;
  onChange: (patch: Partial<Placed>) => void;
}

/** A field drawn over the form with its sample text; dragged to move, its right edge dragged to set the width. */
function FieldBox({ name, field, selected, pageHeight, pageWidth, onSelect, onChange }: BoxProps) {
  const text = SAMPLE_VALUES[name];
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; x: number; y: number; width: number } | null>(null);
  const size = fitSize(text, field.size, field.maxWidth);
  const naturalWidth = textWidth(text, size);
  const width = field.maxWidth ?? naturalWidth;
  const left = field.x * SCALE;
  const top = (pageHeight - field.y) * SCALE - 0.85 * size * SCALE;

  const start = (mode: 'move' | 'resize') => (e: PointerEvent) => {
    e.stopPropagation();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, x: field.x, y: field.y, width };
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / SCALE;
    const dy = (e.clientY - d.py) / SCALE;
    if (d.mode === 'move') onChange({ x: clamp(snap(d.x + dx), 0, pageWidth - 5), y: clamp(snap(d.y - dy), 0, pageHeight - 5) });
    else onChange({ maxWidth: Math.max(8, snap(d.width + dx)) });
  };
  const end = () => {
    drag.current = null;
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : SNAP;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onChange({ x: clamp(field.x + d[0], 0, pageWidth - 5), y: clamp(field.y + d[1], 0, pageHeight - 5) });
  };

  return (
    <div
      class={`box${selected ? ' selected' : ''}`}
      style={{ left, top, width: width * SCALE, height: size * 1.2 * SCALE }}
      tabIndex={0}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onKeyDown={key}
      onFocus={onSelect}
      title={FIELD_LABELS[name]}
    >
      <span class="tag">{FIELD_LABELS[name]}</span>
      <span class="sample" style={{ fontSize: size * SCALE, lineHeight: 1 }}>
        {text}
      </span>
      <span class="grip" onPointerDown={start('resize')} onPointerMove={move} onPointerUp={end} title="Drag to set the maximum width" />
    </div>
  );
}
