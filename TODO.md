# Rosebud — To-do

## Decisions settled (2026-10-13)
- v1 starts from the **patient chart**; prints that one patient's Routing Form only.
- Later: a **schedule-screen** mode — a separate function that prints the whole day, or only the selected patient.
- Routing Form = blank-PDF overlay (Form Template); output need only resemble the old spreadsheet layout.
- Patient with several appointments that day: one Routing Form, for the **first time slot**.
- Age: whole years on the appointment date, months under 2 years.
- v1 Pre-filled Fields: Date, Appointment Time, Name, D.O.B., Age, ID #, Balance Due (will likely change).
- Read-only (never writes to a chart); all data stays on the PC.

## Open items (as of v0.1.3, 2026-10-14) — front desk trial under way; see HANDOFF.md
- [ ] After the trial: ask whether to keep the patient list on the Provider Cover Page.
- [ ] Not yet exercised live: the today-or-next chooser in the new code (needs a fake patient checked in today) and the Stop button (runs finish too fast to click).
- [ ] Unverified: a status that is neither shown nor hidden today (e.g. a no-show not yet marked) — Rosebud hides only 2, 5, 6.
- [ ] Unconfirmed: the "□" glyph on the four checkbox items of the form is what they should show.
- [ ] Possible later: more Pre-filled Fields (each new kind of value needs a code change, then appears on the settings page).
- Done since the first list: form changes without code (settings page), blank PDF export (LibreOffice), Schedule Mode. Dropped: the Reason For Visit prompt (replaced by RFV in Comments).

## Findings from RevolutionEHR (2026-10-13, test patient = the user's own chart)
- Patient summary URL: `https://revolutionehr.com/static/#/patients/patient/<patientId>/patient-summary`; login via `https://revolutionehr.com/static/#/`.
- Chart header shows name, `#ID`, DOB, "(38 Years)" (age as of TODAY — Rosebud computes age as of the appointment date instead), address, phone.
- Account panel: Patient Balance / Patient Credit / Insurance Balance / Family Balance / Family Credit. **Balance Due = Patient Balance.**
- Exam History panel shows "Next Appt" (this test patient had none, so the appointment format is still unseen).
- The page loads data from internal JSON web services, e.g. POST `/pms2/ws/patient/pod/getAccountBalancesAndCreditsByPatientId/<id>`; not yet inspected — candidate to read instead of scraping the page.

## Progress (2026-10-13)
- [x] LibreOffice installed; blank PDF exported to `form/blank-routing-form.pdf` (single page, matches the sheet).
- [ ] Known flaw in that export: the sheet's Wingdings checkbox/arrow characters print as "ð" (before Screening Photo, EF, NCT, Still Dilating). Fix when finalising the Form Template (redraw as ☐ or replace the font).
- Settled: multiple appointments in a day → earliest one. No appointment today → message, print nothing. Services may be read with page-text fallback.
- [ ] Still unseen: how an appointment (date/time) appears. Needs a patient with an appointment today.
- Note: the Coding Companion drives RevolutionEHR's screens (DOM/Syncfusion grids), not its JSON services; Rosebud's read-only data needs may justify the services.

## Appointment findings (2026-10-13, test appt on user's chart)
- Exam History panel → "Next Appt" row: link text `Tuesday 10/13/2026 at 9:00 PM`, then visit type (`Long Medical`), provider (`Provider A`), location (`the practice location`).
- Patient summary loads ~20 JSON services (`/pms2/ws/patient/...`), including `getPatientDashboardSummaryById`, `findLastAndNextEncounterByPatientId`, `getAccountBalancesAndCreditsByPatientId`. A direct call from the page with no extra headers returns **403** (needs the app's own request headers/token) — not pursued; read the page text, as the Coding Companion does.
- A full page reload (F5) on the chart goes through "Validating credentials" and returns to the chart; the session survives. (Not so on 2026-10-14: a reload and closing the tab both went to the login page. Expect to sign in again.)
- Unverified: whether "Next Appt" skips an appointment earlier today whose time has already passed (matters if the form is printed after check-in).

## Settled 2026-10-13 (round 4)
- Name prints **First Last** ("Harry Potter"), converted from the chart's "Last, First".
- ID # = patient number only (e.g. 117820477); ignore "(NEW)".
- Button: small floating button on the **patient summary and schedule pages**.
- First build = standalone proof (sample values → filled PDF), tune positions, then the extension.
- **Appointment source:** a checked-in appointment moves from "Next Appt" to "Last Exam" on the summary. Rosebud must read BOTH panels. If Last Exam is dated today and Next Appt is also today, ask the user which one is wanted. (Open: does "Last Exam" show a time? The panel shows only a date.)

## Proof of fill built (2026-10-13)
- `tools/fill.mjs <template.json> <values.json> <out.pdf>` (pdf-lib) + `tools/find-text.mjs <pdf> [regex]` (pdfjs: lists text positions) + `template/routing-form.template.json` (field positions in PDF points) + `template/sample-values.json`. Output: `out/sample.pdf`. First placement attempt landed on the blanks.
- DOB prints as three pieces (month/day/year) because the form pre-prints the slashes.
- Known flaws in the LibreOffice blank (vs. the Excel original): "Fit disc: ... 50%" lost its 50%; some columns crowd ("Eye Med AE Assurance", "IU Health IU MC", "Medicare Sagamore"); Wingdings arrows print as "ð". Decide: fix in the sheet before re-export, or redraw the blank.
- Balance Due prints "0" at $0.00 (changed 2026-10-14; it used to stay blank) (the sample file has 0.00 only to test placement).

## Form edits done (2026-10-13)
- `form/Routing Form 10 12 2026 (edited).xlsx` = copy of the original with: the "ð" symbols replaced by "□" (Calibri); C48's blank-space cell cleared so "Fit disc … 50%" is no longer cut off; columns C, D, H widened to 10. Original untouched. `form/blank-routing-form.pdf` is now the export of the edited copy; the first export is kept as `form/blank-routing-form.v1-original.pdf`. Template coordinates re-tuned; `out/sample.pdf` regenerated.
- Open: user to confirm the "□" glyph is what those four items should show (original glyph unknown — it was "ð" in the Symbol font).

## Appointment time rules (2026-10-13)
- "Last Exam" shows a **date only, no time**.
- If Last Exam is dated today: ask the user whether they want the form for **today's appointment** or the **next appointment**. If today's, open the **schedule** and read the appointment time there.
- If Last Exam is not today: use "Next Appt" (its time is on the summary).

## Schedule page findings (2026-10-13; real patient names were on screen — none recorded here)
- URL: `https://revolutionehr.com/static/#/schedule/schedule`; date picker at top (Tue Oct 13, 2026, Today/+1/+3…), Day/Week/Work Week views; one **column per provider**; a filter button (providers may be hidden by it).
- Left **Agenda** list, one entry per row: `Last, First(age)` or `Last, First(New)(age)`, then provider, then `8:50 AM - 9:00 AM`. It also lists non-patient entries: `Appt Slot (free)`, `Busy Time` — these have no age and must be skipped.
- The calendar grid shows the same appointments with: start time, `Last, First (N Years)`, appointment type (e.g. `Long Medical`, `New Comprehensive Exam`), provider.
- Clicking an appointment opens an **Appointment** side panel with name, DOB, `#patientId`, date/time range, a status badge (e.g. COMPLETED) and appointment type. This is where the ID # can be matched; the agenda rows do not carry it.
- The test appointment appears as `Potter, Harry(New)(46)` 9:00 PM - 9:10 PM, provider Provider A.
- No dates in agenda rows (the date comes from the picker). Rosebud must confirm the picker is on today.

## Settled 2026-10-13 (round 6)
- From a chart, the schedule is read in a **background tab** (opened, read, closed); the user's chart tab is never touched.
- Matching a patient on the schedule: "Last, First" + age; if more than one row matches, click each row (opens the right-hand Appointment popup, which shows the `#` patient ID) and compare IDs; if still unclear, ask the user to pick.
- Only the providers currently on screen are read; the front desk puts the providers they want on screen first. Cancelled and rescheduled appointments disappear from the schedule, so nothing to filter. (No-show appearance not yet seen.)
- **Schedule mode uses the date the user is viewing** (so forms can be printed a few days ahead). The "today's schedule" lookup applies only to chart mode's same-day Last Exam case.
- Chart mode with a future Next Appt: use it as is (date and time are on the summary).

## Settled 2026-10-13 (round 7)
- **Office-only tool, not shared, no store.** Not required to be an extension if something simpler works (see options discussed in chat: unpacked extension vs bookmarklet vs desktop helper).
- No-shows: forms are printed before the patient arrives, so no-show handling is not needed.
- Nothing stored or sent; PDF opens in a tab (blob) and exists only while that tab is open.
- Template bundled in separate files for v1; settings-page import is a later to-do.

## DESIGN SUMMARY (agreed 2026-10-13, pending final user confirmation)
- **What:** office-only **unpacked Edge extension** (no store, no installer); read-only; nothing stored or sent. Floating button on patient-summary and schedule pages.
- **Output:** one-page Routing Form PDF = `form/blank-routing-form.pdf` + `template/routing-form.template.json` (pdf-lib overlay), opened as a blob in a new tab for printing. Template bundled in files separate from code (settings-page import = later to-do).
- **Fields (v1):** Date, Appointment Time, Name (First Last), D.O.B. (3 pieces), Age (years on appt date; months under 2 yrs), ID # (patient number), Balance Due (= Patient Balance; blank at $0).
- **Chart Mode:** read header + Account panel + Exam History (Next Appt and Last Exam). Last Exam not today → use Next Appt (time on page; future dates fine). Last Exam today → chooser: today's appointment (earliest time read from the schedule in a background tab) vs next appointment. No appointment found → message, print nothing. Time not found → print with time blank and say so; never guess.
- **Schedule Mode (later):** date and providers as on screen; skip non-patient rows (Appt Slot, Busy Time); match patient by name+age, confirm with the ID in the right-hand popup; earliest appointment per patient; combined PDF in time order for a day; or just the selected patient.
- **Later to-dos:** form-reformat path/template import page; Reason For Visit prompt; more Pre-filled Fields; fix remaining crowding on the form if wanted.
- **First build step:** extension skeleton + chart-page reader against the test patient (own chart), reusing Coding Companion build/manifest/page-reading patterns.

## Design changes (2026-10-13, after the summary)
- **Appointment Time (corrected):** the earliest time THAT PATIENT is scheduled that day — never the earliest slot on the schedule. (Was misworded in the summary.)
- **Schedule Mode printing:** ask which provider to print for; if several, sort **by provider first, then appointment time**. (Open: provider order.)
- **Reason For Visit prompt is dropped.** Replaced by reading the appointment's **Comments** box (visible in the Appointment popup when an appointment is clicked): note the exam (appointment) type, and the text after "RFV" up to the end of that reason (first sentence; ideally a line break / new paragraph marks the end). Details still being clarified — see chat.

## Reason For Visit + provider print (settled 2026-10-13, round 9)
- Reason For Visit line = one line: `Exam type — reason`. Exam type = the appointment type name; the bracketed detail (e.g. "(1. Cataract Post Op)") is probably dropped (to confirm).
- Real example (fake test patient, Sun 9/27/2026): popup **Comments** = `RFV: 1 month post op⏎original surgery 8-11-26⏎co-management forms scanned in`. RFV text = from after "RFV:" to the **first line break**. Expected output: `Cataract Post Op Exam — 1 month post op`.
- Rule: "RFV" (case-insensitive) + optional `:`/`-`/space, first occurrence, to the first line break (or the end of the comment if none). No RFV in the comments → print exam type only (other comments are staff notes and never print).
- Long text shrinks to fit the line, never runs off the page.
- Appointment popup for an ACTIVE appointment has buttons **Confirm, Start, Reschedule, No-show, Cancel, Save** — Rosebud must NEVER click these. It may only click an appointment block to open the popup, read it, and close the popup with the X.
- **Schedule Mode PDF:** ask which provider(s). Order = providers left-to-right as the columns appear on screen; within a provider by appointment time; all of provider A's patients, then provider B's (never mixed by time). A **Provider Cover Page** before each provider's forms: e.g. "Provider A — 12 exams".
- 9/27/2026 on the schedule has fake test patients (Potter, Test, Doe) — good day for schedule-mode testing.

## Settled 2026-10-13 (round 10)
- Exam type prints **without** the bracketed detail.
- **Provider Cover Page** = provider name, date, exam count, and a list of every patient with time and **exam type** (no reason for visit). May run to a second page. **To-do: after a trial period, ask the user whether to keep the patient list on the cover page.**
- RFV marker: "RFV" in any case + `:`/`-`/space, **first occurrence anywhere in the comment** (staff will try to put it first, not guaranteed), to the first line break.
- The chart's **Next Appt link goes to the schedule on that appointment's date with the appointment sidebar open** → Chart Mode reads the exam type and Comments by opening that link in the background tab (no extra search). Today's-appointment case (Last Exam today): open the schedule for today and find the patient, as before.
- Schedule Mode: one form per patient per provider (earliest time with that provider); cover-page count = forms, not slots.

## Build status (2026-10-13, night)
- Built and committed: repo `github.com/drnickearls/rosebud` (private then; PUBLIC since — no patient data in it). Core logic + tests (13 passing), readers (chart header/Account/Exam History, Appointment panel, schedule date/provider columns/Agenda), background-tab jobs (nextAppt, todayAppt, chartFacts, chartBalances), Chart Mode, Schedule Mode (provider chooser, cover pages, one form per patient per provider), floating button, PDF in a new tab.
- Readers were checked live against the user's Chrome tab (test patient chart, schedule, appointment panel). **Not yet tested live inside the loaded extension:** the background-tab jobs, the button, the PDF opening, Schedule Mode. First step next: user loads `dist/extension` unpacked (Chrome: chrome://extensions → Developer mode → Load unpacked; Edge: edge://extensions).
- Risk to watch: background tabs are throttled (the Coding Companion measured 1-second timers and Syncfusion hangs in hidden tabs, ADR 0005). If the jobs are too slow or hang, open the job tab in a small separate window instead.
- Known gap: Last Exam same-day detection assumes the Last Exam date equals the local PC date.

## Switched to RevolutionEHR's own data calls (2026-10-13, after the first schedule test)
- The user's schedule test: the PDF tab opened before the provider choice was made; background tabs were very slow ("could not open … / balances timed out"); no way to stop a long run. Fixed: **no background tabs at all**; the output tab opens only after the choice; a **Stop** button is shown while it runs.
- Data now comes from the same web services RevolutionEHR's screens call, sent from the page with the session cookie and the `X-XSRF-TOKEN` header (value of the `XSRF-TOKEN` cookie). Read-only calls only (`src/ehr/api.ts`):
  - `POST /pms2/ws/schedule/findScheduleItems` `{startDate:"YYYY-MM-DD", locationId, scheduleView:"day"}` → day list (appointments, free slots, busy time). Appointment fields used: `scheduleItemId`, `startDate` (UTC), `status`, `patientName{lastName,firstName,patientId}`, `provider{lastName,firstName}`, `patientDob`, `template`.
  - `POST /pms2/ws/schedule/findScheduleItemSidebarById/<scheduleItemId>` → `description` (the Comments box), `template.name` (exam type).
  - `POST /pms2/ws/patient/pod/getAccountBalancesAndCreditsByPatientId/<id>` → `patientBalance` (number).
  - `POST /pms2/ws/patient/pod/findLastAndNextEncounterByPatientId/<id>` → `nextAppointmentResponse{appointmentId,startDate,templateName}`.
  - `POST /pms2/ws/patient/getPatientDashboardSummaryById/<id>` → `primaryLocation.id` (= the schedule's location id).
- Appointment `status` seen on a real day: 0 scheduled, 3 completed (both shown on the schedule); 2, 5, 6 are NOT shown on the schedule (cancelled / rescheduled / no-show, inferred by matching 19 visible Agenda rows to 29 service appointments). Rosebud hides 2, 5, 6 and keeps any other status.
- The schedule's location id is learned by watching the schedule page's own `findScheduleItems` request (script runs at document start). If it hasn't been seen, Rosebud asks the user to click the schedule's refresh button once.
- Times: service times are UTC; shown on the PC's clock (the practice's, Eastern).
- Checked live on the 9/27 fake-patient day: exam types, RFVs, balances and DOBs all read correctly; whole day of balances + details in a fraction of a second.
- Old background-tab code, the bridge and the service worker are deleted; the manifest has one script and no permissions.

## Live test results (2026-10-13, night)
- Schedule Mode on the 9/27 fake day: cover page + 8 forms, order/fields correct. Chart Mode on a fake chart: form correct, RFV from Comments fits the line. The which-appointment chooser works (user-checked). Stop button not exercised live: a run now finishes faster than a person can click it.
- Still to do: template-import page (form changes without a rebuild); "keep the cover-page patient list?" question after a trial; Last Exam date vs PC date; no-show status mapping if a no-show ever prints.

## Round of tweaks (2026-10-13, late)
- "Balance due" underline lengthened in the sheet (`$____` to `$________`; the text field only used to be allowed to shrink). Blank PDF re-exported; template balance field moved to x=489, maxWidth 44.
- The PDF tab no longer opens at the click: the user stays on the schedule while it runs and the tab opens when the PDF is ready (if the browser blocks it, the panel shows an "Open the PDF" link).
- Progress: "Gathering patient details: X of Y", then "Routing Forms completed: X of Y".

## Form settings (2026-10-13, built)
- A **Form…** button beside the Routing Form button opens a settings dialog: choose a new blank PDF, load a Rosebud form file (`*.rosebud-form.json` = blank PDF + field positions in one file), edit each field's x / y / size / max width (or untick it to leave it off), **Test print** (made-up patient, opens in a tab), **Save**, **Export this form**, **Use the built-in form**.
- Saved in this browser's localStorage for revolutionehr.com (key `rosebud.form.v1`): per computer, no extension permission, no patient data. If that browser's site data is cleared, Rosebud falls back to the built-in form; Export keeps a copy to move to another PC.
- Limits: the field list is fixed in code (the ten `FormValues` keys); a NEW kind of value (e.g. insurance) needs a code change, then it appears in this table. PDF must open in pdf-lib, max 3 MB; page 1 is used.
- Not built: dragging fields on a picture of the page (needs a PDF renderer in the page). `tools/find-text.mjs` still lists where the labels sit on a PDF to work out x/y.

## Form settings moved to an extension page, drag-and-drop (2026-10-13, late)
- The in-page dialog (and its Form… button) is gone. The form builder is now the extension's **settings page** (`options.html`): opened by the toolbar button, or "Extension options" in the browser's extension list. It runs on the extension's own origin, so RevolutionEHR's page rules don't apply.
- It draws the blank PDF with **pdf.js** (minified build + `pdf.worker.min.mjs` copied into the extension) and lays draggable field boxes over it (sample text inside each box, so what you see is what prints; the same shrink-to-fit rule as the PDF). Drag = move (0.5 pt snap); drag the right-edge grip = max width; arrow keys nudge; A−/A+ = text size; unplaced fields wait as "+ Field" chips; **Suggest positions** places boxes next to the new form's labels (Date:, Name, D.O.B., Age, ID #, Balance due, Reason For Visit); Test print / Save / Export / Load a form file / Use the built-in form. Leaving with unsaved changes asks first.
- Storage: `chrome.storage.local` (new `storage` permission). The RevolutionEHR page can't read it, so a small **bridge** content script (ISOLATED world) hands the saved form to the page when a print starts; a tiny service worker opens the settings page from the toolbar button. A form saved by the earlier in-page dialog (localStorage) is NOT carried over.
- Preact is pinned to 10.x (an unpinned install brought in 11, which ignored `style` objects).
- Checked with a stand-in for chrome.storage on localhost: the page draws the form, boxes line up, drag works, unsaved-change warning works, Test print opens the PDF. NOT checked inside the real extension: save → print uses the saved form (bridge path).

## New default Routing Form (2026-10-13, late)
- Source: the user's `Routing Form tester.xlsx` (kept as `form/Routing Form 2026-10-13 (user original).xlsx`). Changes by the user: birth date is ONE blank (`D.O.B. ____________`, slashes removed), longer Balance due underline (9 underscores), COB is now a plain `COB: ______________` line, plus one change in a part Rosebud doesn't touch.
- The tester file still had the problems fixed earlier (Symbol-font "ð" marks, "Fit disc … 50%" cut off, crowded columns), so the same three fixes were applied to a copy: `form/Routing Form 2026-10-13 (edited).xlsx` -> exported as the new `form/blank-routing-form.pdf` (also in `src/assets/`). Earlier exports are kept in `form/`.
- Code: the birth date is now one value `dob` ("MM/DD/YYYY") instead of dobMonth/dobDay/dobYear; a form saved with the old three pieces is converted on load (month's position kept, max width 62). Template `Routing Form 2026-10-13`: dob x 273, age x 371.5, ID # x 456.6, balance x 492 (max width 44).

## Bigger patient text and a provider line (2026-10-14)
- Printed text only (the form itself is unchanged): **Name 20 pt bold, Age 20 pt bold, D.O.B. 15 pt bold**, each shrinking to fit its blank (long names / "14 mo" shrink). D.O.B. is limited by the space between its label and "Age" on the existing one-line form. A form change (name/age row and D.O.B./ID row, 18 pt, one extra line) was prototyped and works, but was set aside at the user's request; the spreadsheet recipe is in this day's chat only.
- New printed value **Provider** (last name only), **20 pt bold at the top-left of the page**, fed from the appointment's provider (chart: next appointment / today's schedule row; schedule: the row's provider). Fields can now be **bold** (template `bold`, settings page "Bold" box).
- Provider is missing from a custom form saved earlier; add it on the settings page ("+ Provider") or use the built-in form.

## Stable save point (2026-10-14)
- Git tag **`stable-2026-10-14`** = commit `ebde1ac` = release v0.1.2: chart and schedule printing, provider/name/age/D.O.B. sizes, "0" balance, drag-and-drop form settings, front desk guide; live-tested on fake patients; 23 tests pass. To get back to it: `git checkout stable-2026-10-14` (or `git switch -c recover stable-2026-10-14`). The v0.1.2 release zip is the installable copy.
- Architecture changes after this point should happen on a branch (e.g. `git switch -c architecture`), so main stays releasable.

## Architecture change (2026-10-14, merged to main, released as v0.1.3)
- Plan and reasons: docs/ARCHITECTURE-HANDOFF.md. Done: steps 1-4 and the two further candidates (saved form, form editor).
- **Routing Forms module** `src/routingForms/` (`createRoutingForms({ ehr, form, now })` -> `offer(mode)` / `print(choice)`): reads RevolutionEHR only through the **`Ehr` port** (`src/routingForms/ehr.ts`); never touches the page, tabs or `fetch`. Inside: plan (visits, order, notes) then draw. Status filter (2/5/6) and "today's appointment = earliest at the primary location" live here.
- Production adapter `src/ehr/revolution.ts` (services -> Rosebud terms: UTC to local once, names trimmed, birth date by its date part) + `src/ehr/screen.ts` (screen context only: chart id from the address, schedule date, provider columns, open appointment's patient id + time). `src/ehr/api.ts` = raw read-only calls. `app.ts` = chooser glue + PDF tab + messages.
- **Chart Mode now reads the patient from the services** (`getPatientDashboardSummaryById` + `findLastAndNextEncounterByPatientId` + balances) instead of the chart screen; the chart page DOM readers are deleted.
- Small behaviour changes: today's appointment found but its reason unreadable keeps the time (was blank); Stop also stops during PDF drawing; "Print only <name>" takes the name from the day list.
- Tests: `test/fakeEhr.ts` (in-memory RevolutionEHR: fixtures, failures, abort, call log, in-flight count); `test/routingForms.test.ts` (15, at the module interface); `test/revolution.test.ts` (adapter mapping, TZ America/Indiana/Indianapolis). 41 tests pass; mutation check: removing the status filter or the earliest-first sort fails tests.
- Live check (fake data, after reload): Chart Mode on Potter, Albus -> next appt 12/25/2026 9:00 AM, D.O.B. 01/05/2008, age 18, RFV from Comments: correct. Schedule Mode 9/27/2026: cover + 8 forms, Harry Potter = "Cataract Post Op Exam — 1 month post op": correct. "Print only" the open appointment: one form, no cover: correct. Not exercised live: the today/next chooser (no fake patient checked in today), Stop.
- **Saved form module** `src/savedForm/` (`createSavedForm(storage)` -> load / save / reset) behind a **`FormStorage` port**: chrome.storage adapter (settings page + bridge.js) and page-bridge adapter (page.js asks bridge.js by message, read only). An unreadable saved form prints the built-in one with a `problem` warning; a tab opened before Rosebud was reloaded says to reload RevolutionEHR.
- **Form editor module** `src/formEditor/`: pure functions over a draft (drag with y-flip and 0.5 pt snap, width grip >= 8, arrows / Shift 5 pt, size 6-24, bold, add/remove, suggested positions, screen box). The sample text in the settings page shrinks with the same `fitSize` (src/core/pdf.ts) the PDF uses. `src/options/App.tsx` is now a view over the two modules.
- Fixes found while checking: clicking a field box now focuses it, so arrow keys work (bug also in v0.1.2); pdf.js asked for errors only (its harmless font warning showed under Edge's Errors button).
- 58 tests pass. Settings page checked in a local stand-in (9 boxes, drag snap, Shift+arrow, A-, Save, damaged file, reset) and live: a saved Name size of 18 printed at 18 on Potter, Albus's chart, then reset.
- Live-check order: rebuild -> reload Rosebud -> reload RevolutionEHR (signs out) and sign in. Reloading or closing that tab signs the user out.
- Released **v0.1.3** (commit f9ed901, tag `v0.1.3`): zip + guide PDF on GitHub, marked latest. To go back to v0.1.2: tag `stable-2026-10-14`.

## New default Routing Form (2026-10-16, released as v0.1.4)
- Source: the user's sheet of 10/14 (saved 10/15). Kept as `form/Routing Form 2026-10-14 (edited).xlsx` with ONE change: the "No <coworker name>?" box reads **"No Scribe?"** (the public repo carries no coworker names; the user chose the wording). The user's own copy is not in the repo.
- The user's changes: longer Name and D.O.B. blanks, insurance rows rearranged, Reason For Visit moved down a row block, clinical block reorganised. None of the old symbol-font or cut-off problems came back, so no other fixes were needed.
- Exported with LibreOffice to `form/blank-routing-form.pdf` (= `src/assets/blank-routing-form.pdf`). Template `Routing Form 2026-10-15`: date 209/762.5, appointment time 470/762.5, name 63.5/735 (max 186), D.O.B. 298.5/735.5 (max 78), age 404.5/735, ID # 491/734, balance 485/684.5 (max 45), reason 145.5/588.5 (max 319); provider unchanged. Checked by printing the sample patient with Rosebud's own PDF code.
- Computers with a custom form saved on the settings page keep that form; "Use the built-in form" switches them to this one.
- Also in v0.1.4 (re-published 2026-10-17, same version, tag moved): the guide's shared-drive setup, and **messages over the button fade on their own**. A plain "done" message fades after 5 s (0.4 s fade); the mouse over it pauses the clock and leaving starts the full 5 s again. Warnings, errors, and the "Open the PDF" link (tab blocked) stay until Close. Rule + timer: `src/ui/autoClose.ts`, tests `test/autoClose.test.ts`; checked in a local page with the real panel (`.scratch/panel/`, launch entry `rosebud-panel-demo`).

## Share form (2026-10-20, released as v0.1.5)
- A browser extension can't write to its own folder, so a form change can't flow to every computer by itself. Instead, on the settings page: **Share form** (was Export) saves the form file into the `forms` folder inside the Rosebud folder; **Load a form file** opens there; **Choose a new blank form** always opens in Downloads. Each computer still Saves for itself.
- Edge can't open a dialog at a named path, only at a well-known folder or a file chosen before. So the forms folder is remembered per computer (IndexedDB, last shared/loaded file handle): the first Share or Load opens in Documents with a hint to go to Rosebud\forms. Code: `src/options/formFiles.ts`. The build ships `forms/README.txt`, so unzipping a new version over the shared folder leaves shared forms alone.
- Checked in the settings-page harness with stand-in dialogs (real browser file handles): first Share in Documents, then the remembered folder; Load in the remembered folder; blank PDF in Downloads; the shared file reloads. NOT checked yet on a real computer with Edge's own dialogs and the shared drive.
