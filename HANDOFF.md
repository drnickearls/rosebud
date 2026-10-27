# Rosebud: handoff

## Where to pick up (2026-10-21)

**Stopping point: v0.1.7 released (built-in form update of 10/27); the front desk trial continues.** No job is open. Next work starts from what the trial turns up.

- Released: **v0.1.7** (tag `v0.1.7`): built-in form with "Scribe? Y N" / "Extern? Y N" and a plain "Other" in the medical insurance row (TODO.md "Form update (2026-10-27)"). Before that, **v0.1.6** (tag `v0.1.6`): the chart's nickname prints in quotation marks, First "Nick" Last (TODO.md "Nicknames on the forms"). Installed at the office and confirmed printing correctly by the user (2026-10-21). Before that, **v0.1.5** (tag `v0.1.5`): Share form / Load a form file use the `forms` folder inside the Rosebud folder (TODO.md "Share form (2026-10-20)"). Installed from the server folder; the user confirmed **Share form works** with Edge's real file windows (2026-10-20). Load a form file on a second computer not explicitly reported yet. The release's guide PDF was re-uploaded after the 'replace the contents, keep the folder' wording (2026-10-20). v0.1.4 = the new default form, the shared-drive guide, and self-fading messages; v0.1.3 = the architecture rework. `main` is clean; the only branch is `main`.
- Fallback: tag `stable-2026-10-14` = v0.1.2 (the release before the architecture rework). Its zip is still on GitHub.
- Every computer loads Rosebud from ONE unzipped folder on the office server (set up 2026-10; working). Edge ties Rosebud to that exact folder path: an update must replace the folder's CONTENTS, never the folder (a new or renamed folder breaks the install; the user confirmed 2026-10-20). An update = replace the files once + reload Rosebud on each computer. A saved form stays per computer; Share form + Load a form file copies it.
- New default forms come from the user as a spreadsheet: see "Changing the built-in form" below.
- 65 tests pass (`npm test`); `npm run typecheck` is clean.

### When the trial reports back

1. Ask for the **date, the patient's chart or the schedule day, what was clicked, and what printed** (or the message in the box above the button). Reproduce on the fake data below before touching real days.
2. Open questions to put to the front desk: keep the patient list on the Provider Cover Page? Any form text too big, too small, or in the wrong place? Did Load a form file work on a second computer?
3. Still open from before the trial: TODO.md "Open items".

## Rules (carry these into every session)

- The repo is **PUBLIC**. No real patient names or personal data in code, tests, docs, commits or release notes: not the user's own name, birth date or patient id, no coworker names, no practice name, no Gmail address. Test fixtures use Harry Potter names.
- Commits are authored as **drnickearls** with the GitHub noreply address (already set in this repo's git config).
- **Don't merge to main or publish a release without the user's go-ahead.** Do bigger changes on a branch.
- RevolutionEHR is **read-only** for Rosebud and for whoever tests it: never click Confirm, Start, Reschedule, No-show, Cancel or Save on an appointment.
- Live testing only on **fake data**: chart **Potter, Albus** (`https://revolutionehr.com/static/#/patients/patient/117821028/patient-summary`, next appointment 12/25/2026 9:00 AM) and the schedule for **Sunday 9/27/2026** (fake patients Potter, Doe, Test; 8 forms + cover). Every other day shows REAL patients: don't screenshot, read or record them.
- **Closing or reloading the RevolutionEHR tab signs the user out.** Ask first. The user signs in; never type a password.

## Live-check order after a code change

1. `npm run build` (writes `dist/extension`), `npm test`, `npm run typecheck`.
2. The user clicks **reload** on the Rosebud card at `edge://extensions`.
3. The user reloads RevolutionEHR and signs in. An already-open tab keeps the old bridge script, which can no longer read the saved form ("reload RevolutionEHR" warning).
4. Check on the fake chart / 9/27 day. The settings page can also be checked outside the extension: `node .scratch/options-harness.mjs` (local only, gitignored; serves `dist/extension` with a stand-in `chrome.storage` at `http://localhost:5178/harness.html`).

## Releasing (as done for v0.1.3 to v0.1.5)

1. Bump `version` in `package.json` (the build copies it into the manifest).
2. In `docs/front-desk-guide.html` change the zip name (`rosebud-extension-X.Y.Z.zip`) and anything that changed for the front desk.
3. Regenerate the guide PDF with headless Edge, using full paths:
   `msedge --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="<repo>\docs\front-desk-guide.pdf" "file:///<repo>/docs/front-desk-guide.html"`.
   Check it: 3 pages since v0.1.5, new zip name present.
4. Commit "Rosebud X.Y.Z", tag `vX.Y.Z`, push `main` and the tag.
5. Zip `dist/extension` with Windows `tar.exe --format=zip -c -f rosebud-extension-X.Y.Z.zip manifest.json page.js bridge.js background.js options.js options.html options.css pdf.worker.min.mjs icons forms` (forward-slash paths; PowerShell 5 `Compress-Archive` writes backslashes). Files sit at the zip's top level, same as v0.1.2; the `forms` folder carries only `README.txt`. Unzip the result and `diff -r` it against `dist/extension`.
6. `gh release create vX.Y.Z --title "Rosebud X.Y.Z" --notes-file notes.md rosebud-extension-X.Y.Z.zip "Rosebud Front Desk Guide.pdf"`. Notes are plain language for the front desk and end with how to update.
7. Check the release is "latest" with both files. To replace only the guide later: `gh release upload vX.Y.Z --clobber "Rosebud Front Desk Guide.pdf"` (ask first).
8. Installing at the office: unzip into the EXISTING Rosebud folder on the server (Replace), then reload Rosebud on each computer and reload RevolutionEHR. Never a new or renamed folder.

In the 2026-10-14 session a safety check blocked steps 3 and 6 from Claude's side, so the user ran them in their terminal; from 2026-10-16 on both ran fine. If it happens again, stage the files so the user only runs one command.

## Changing the built-in form (as done for v0.1.4)

1. **Check the sheet for names first**: cell text (the 10/14 sheet had a coworker's name in a "No <name>?" box, now "No Scribe?"), the download's file name (it carried the user's surname), and `docProps/core.xml`. Ask before changing the user's wording.
2. Keep the sheet as `form/Routing Form <date> (edited).xlsx`. Edit cell text in `xl/sharedStrings.xml` and rezip with `tar.exe --format=zip` (`-a` alone does not make a zip for an .xlsx name).
3. Export with LibreOffice: `soffice.com --headless --convert-to pdf <xlsx>`; one page; copy to `form/blank-routing-form.pdf` and `src/assets/blank-routing-form.pdf`.
4. `node tools/find-text.mjs <pdf> <regex>` gives the label positions; move each field in `src/assets/routing-form.template.json` by how far its label moved; give the template a new name.
5. Draw the sample patient with Rosebud's own `buildPdf` and look at it (local, gitignored `.scratch/newform/sample.ts`, bundled with esbuild; `soffice --convert-to png` renders it). Then build, test, and release.

## How the code is laid out

Details and reasons: [docs/ARCHITECTURE-HANDOFF.md](docs/ARCHITECTURE-HANDOFF.md). Vocabulary: [CONTEXT.md](CONTEXT.md).

- `src/routingForms/`: the Routing Forms module. `createRoutingForms({ ehr, form, now })` gives `offer(mode)` (what to ask the user) and `print(choice)` (the PDF). It reads RevolutionEHR only through the `Ehr` port (`ehr.ts`) and decides everything: which appointment, hidden statuses 2/5/6, order, cover pages, warnings.
- `src/ehr/`: the production `Ehr`. `api.ts` = raw read-only web-service calls; `revolution.ts` = mapping into Rosebud terms (UTC to local once); `screen.ts` = what's on screen (chart id, schedule date, provider columns, open appointment).
- `src/savedForm/`: the saved custom form behind a `FormStorage` port. `chromeStorage.ts` (settings page, bridge.js) and `pageBridge.ts` (page.js asks bridge.js by message; read only).
- `src/formEditor/`: pure editing functions for the settings page (drag, snap, nudge, size, bold, suggestions, screen box).
- `src/core/`: form template, PDF drawing (`pdf.ts`, incl. shared `fitSize`), formatting, appointment and schedule rules.
- `src/app.ts` + `src/main.tsx` + `src/ui/`: the floating button and panel on RevolutionEHR (page.js, MAIN world); `ui/autoClose.ts` = which messages fade after 5 s and the timer.
- `src/options/`: the settings page (Preact 10, pdf.js to draw the blank form); `formFiles.ts` = the Share / Load / blank-PDF file windows and the remembered forms folder. `src/extension/`: bridge.js (ISOLATED world) and the toolbar service worker.
- Tests: `test/fakeEhr.ts` (in-memory RevolutionEHR) drives `test/routingForms.test.ts`; plus adapter, saved-form, form-editor and core tests. The adapter tests set TZ America/Indiana/Indianapolis themselves (`test/revolution.test.ts`).

## Gotchas

- RevolutionEHR's services need the `X-XSRF-TOKEN` header from the `XSRF-TOKEN` cookie; Rosebud calls them from the page with the session.
- The schedule's location id is learned from the schedule page's own request; if missing, the user is asked to click the schedule's refresh button once.
- pdf.js 6.x is set to report errors only (`verbosity`), because the blank form's font makes it warn, and Edge lists that under the extension's "Errors" button.
- Preact must stay on 10.x (11 ignores `style` objects).
- Edge can't open a file window at a named path (e.g. S:\Rosebud\forms), only at a well-known folder or a handle chosen before; hence the remembered forms folder and the first-time hint. An extension can't write to its own folder at all.
- Node's mock timers don't fire a timeout set during the same `tick`: tick in steps (`test/autoClose.test.ts`).
- The panel demo page for the button's messages: `.scratch/panel/` (local), launch entry `rosebud-panel-demo`.
- Claude in Chrome can't open `chrome-extension://` pages; use the localhost harness above for the settings page.
