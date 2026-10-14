export const STYLES = `
:host { all: initial; }
.wrap { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1f2937; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.fab { background: #be1848; color: #fff; border: 0; border-radius: 999px; padding: 9px 16px; font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.fab:hover:not(:disabled) { background: #9f123b; }
.fab:disabled { opacity: .6; cursor: default; }
.panel { background: #fff; border: 1px solid #d1d5db; border-radius: 10px; padding: 12px 14px; width: 320px; max-width: calc(100vw - 32px); box-shadow: 0 6px 24px rgba(0,0,0,.25); }
.panel p { margin: 0 0 8px; }
.title { font-weight: 600; }
.working { display: flex; align-items: center; gap: 8px; }
.spin { width: 14px; height: 14px; border: 2px solid #e5e7eb; border-top-color: #be1848; border-radius: 50%; animation: s 0.8s linear infinite; flex: none; }
@keyframes s { to { transform: rotate(360deg); } }
.ok { color: #166534; font-weight: 600; }
.err { color: #b91c1c; font-weight: 600; }
.warn { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 8px; }
.choice { display: block; width: 100%; text-align: left; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; font: inherit; cursor: pointer; }
.choice:hover { border-color: #be1848; background: #fff1f4; }
.choice strong { display: block; }
.choice span { display: block; color: #4b5563; font-size: 12px; margin-top: 2px; }
.stop { background: #b91c1c; color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.stop:hover { background: #991b1b; }
.check { display: block; margin: 0 0 6px; cursor: pointer; }
.choice:disabled { opacity: .5; cursor: default; }
.link { background: none; border: 0; color: #be1848; font: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
a { color: #be1848; }
`;
