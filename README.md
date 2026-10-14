# Rosebud

An office-only Edge extension that pre-fills the practice's Routing Form from RevolutionEHR and opens it as a PDF to print. Read-only: it never writes to a chart, stores nothing and sends nothing anywhere.

- Vocabulary: [CONTEXT.md](CONTEXT.md). Decisions, findings and the to-do list: [TODO.md](TODO.md).
- The form: `form/` (original spreadsheet, the edited copy, the blank PDF, and `FORM-MAP.md`). The artwork and field positions the extension uses live in `src/assets/`.

## Build and load

```
npm install
npm run build        # writes dist/extension
npm test             # unit tests
```

In Edge: `edge://extensions` -> Developer mode -> Load unpacked -> choose `dist/extension`.

`node tools/find-text.mjs <pdf> [regex]` lists where text sits on a PDF page, for re-aligning the Form Template after the form changes.

## For the front desk

- [docs/front-desk-guide.pdf](docs/front-desk-guide.pdf): how to print Routing Forms from a chart or the schedule, what to do when something looks off, and one-time setup on a computer.
- Releases carry `rosebud-extension-<version>.zip`: unzip it somewhere permanent and load that folder with "Load unpacked" (see the guide).
