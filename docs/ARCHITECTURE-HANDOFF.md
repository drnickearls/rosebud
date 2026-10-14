# Architecture change: handoff

**Status (2026-10-14): steps 1-4 DONE** on `architecture` (live-checked on fake data; see TODO.md "Architecture change"). Waiting for the user's go-ahead to merge to main and release.

Branch: `architecture` (from `main` at the stable tag `stable-2026-10-14` = release v0.1.2). `main` stays releasable; merge only when everything below is done and live-checked.

## Why

Two ~100-line functions in `src/app.ts` (`printFromChart`, `printFromSchedule`) mix reading RevolutionEHR, deciding which appointment, building values, making the PDF, opening the tab and reporting progress. Nothing in them can be tested without a live browser, and Chart Mode reads the chart *screen* while Schedule Mode uses RevolutionEHR's web services for the same facts. Goal: one deep module behind a small interface, both modes through it, tested with an in-memory fake of RevolutionEHR. The user wants "a solid foundation" because more features are expected.

Vocabulary: module, interface, seam, adapter, depth, leverage, locality (see the `codebase-design` skill), plus CONTEXT.md terms.

## The chosen design (a hybrid of four, compared on 2026-10-14)

1. **Shape (from the "ports and adapters" design).** A module `routingForms` that never sees `Ui`, `window.open`, `document` or `fetch`. Two methods:
   - `offer(mode, signal)`: reads what is on screen (and, in Chart Mode, the patient) and returns what the user may choose: chart -> `sources: [] | [x] | [today, next]` (the caller shows a chooser only when there are two); schedule -> `{ dateLabel, providers, openPatient }`.
   - `print(pick, { signal, progress })`: returns `{ pdf, parts, count, warnings }`. `pick` = `{mode:'chart', source:'today'|'next'}` | `{mode:'schedule', providers}` | `{mode:'schedule', openPatient:true}`. `print` re-reads screen context, never trusts a stale `offer`.
   - Created once: `createRoutingForms({ ehr, form: () => Promise<{assets}>, now: () => CalendarDate })` in `main.tsx`; each button handler is a few lines (chooser glue + `showPdf` + `ui.done`).
2. **One real port, `Ehr`, domain-shaped (not URLs):**
   ```ts
   interface Ehr {
     screen: { patientId(): string|null;
               schedule(): { date; providers: string[]; locationId: number|null } | null;   // providers left to right, "Last, First"
               openAppointment(): { patientId: string; time: string } | null };
     patient(id, signal): Promise<Patient>;     // folds dashboard summary + last/next encounter: chartName, dob, lastExam, next, primaryLocationId
     balance(id, signal): Promise<number>;
     appointmentsOn(date, locationId, signal): Promise<Appointment[]>;   // RAW, every status
     appointmentDetail(id, signal): Promise<{ examType: string|null; comments: string }>;
   }
   ```
   Production adapter wraps `src/ehr/api.ts` + the DOM readers for screen context only (URL hash, schedule date input, provider column headers, the open side panel's patient id + time, the location id learned by `watchScheduleLocation`). It converts UTC to the PC's local time once (`localWhen`). In-memory fake in `test/fakeEhr.ts`: fixtures for patients, balances, days (keyed date+location), details; injectable failures; honours `AbortSignal`; records calls.
   Not ports: output (`showPdf`), clock (a function parameter), saved form (a function parameter), `buildPdf`/`formValues` (pure, called for real).
3. **Internal plan/render split (from the "flexible" design), NOT exposed.** Inside the module one step reads and builds a `Plan` (`Visit`s: patient, when, provider, examType, rfv; ordered, de-duplicated, with `notes`), another draws the PDF. Tests assert on the plan/`parts` without PDFs. Do NOT build `Recipe`, `Sheet`, `Selection` kinds nobody calls, or per-provider output.
4. **Outcomes as values (from the "minimal" design) where it helps:** "no appointment", "nothing to print" are plain `UserError`s the caller turns into `ui.fail`; abort -> `AbortError`, never downgraded to a warning.

## Verified RevolutionEHR facts (2026-10-14, fake patient Potter, Albus #117821028)

- `getPatientDashboardSummaryById`: `name{lastName,firstName}` (first name has a trailing space: trim), `dateOfBirth` `"2008-01-05T18:00:00Z"` (mid-day UTC: take the DATE PART, chart shows 01/05/2008), `primaryLocation.id` (= the schedule's location id).
- `findLastAndNextEncounterByPatientId`: `lastEncounterResponse.encounterDate` `"2024-05-30T14:31:38Z"` (chart shows 05/30/2024: convert to the local day), `nextAppointmentResponse{appointmentId,startDate,templateName,provider{firstName,lastName}}`.
- `getAccountBalancesAndCreditsByPatientId`: `patientBalance` number.
- Day list `findScheduleItems` + `findScheduleItemSidebarById` as in `src/ehr/api.ts`. Hidden statuses 2, 5, 6 are dropped IN THE MODULE (not the adapter) so the fake exercises them.
- PC timezone is America/Indianapolis; tests set `process.env.TZ` before any Date is made (see `test/api.test.ts`).

## Behaviour that must be preserved (read `src/app.ts` and TODO.md for detail)

- Chart Mode: Last Exam is today AND a next appointment exists -> chooser (today's / next); only Last Exam today -> today's; else Next Appt; none -> UserError "This patient has no appointment to print a form for." Today's appointment = the patient's EARLIEST appointment on today's schedule at the patient's primary location. If the appointment/time can't be read: blank field + warning, the print still happens, never guess.
- Schedule Mode: providers chosen from those on screen (left-to-right order), or only the open appointment's patient; per provider by time; one form per patient per provider (earliest); Provider Cover Page per provider for provider picks only; statuses 2/5/6 never included; the schedule's location id must have been seen (else UserError "Click the schedule's refresh button...").
- Per form: provider last name, name (First Last), D.O.B., age on the appointment date, patient id, balance ("0" when zero, blank only if unreadable), reason line = exam type (brackets dropped) + RFV from Comments, date, time.
- Cross-cutting: Stop (AbortSignal), progress "Gathering patient details: N of M" then "Routing Forms completed: N of M" (repaint between forms), warnings list, PDF tab opens only when the PDF is ready, saved custom form or built-in form supplies the assets, 6 requests in flight.

## Steps

1. Port + adapters: `Ehr` interface, production adapter (new `patient()` from the two services above), `test/fakeEhr.ts`. Move the status filter and `startsOn` out of `api.ts` into the module.
2. The module with tests at its interface (replace, don't layer): checked-in + next -> two sources; only checked-in; none; earliest today wins; second appointment same day; statuses 2/5/6 excluded; two providers + repeated patient -> cover page order and one earliest form each; balance/detail read failures -> blank + warning and still prints; missing DOB; abort -> nothing built; name with trailing space; DOB date part; a last name ending in s ("Jones").
3. Rewire `main.tsx`/`app.ts`; delete `src/ehr/chart.ts`, the sidebar scraping, `waitFor`/`chartIsLoaded`/`sameName`; keep `core/*` helpers (merge duplicates of date/time helpers if trivial). `npm run build`, `npm test`, `tsc`.
4. Live check on FAKE data only (see below), then update TODO.md/CONTEXT.md, commit on `architecture`, push. Do not merge to main or cut a release without the user's go-ahead.

## Constraints and pitfalls

- The repo is PUBLIC. No real patient names, no personal data (the user's own name/DOB/patient id, coworker names, practice name, Gmail). Fixtures use Harry Potter, Albus Dumbledore, etc. Commit email is the GitHub noreply address (already configured).
- Live testing: Chrome tab signed in to RevolutionEHR (https://revolutionehr.com/static/#/). Chart: Potter, Albus `#/patients/patient/117821028/patient-summary` (next appt 12/25/2026). Schedule: 9/27/2026 has fake patients (Potter, Doe, Test); other days show REAL patients, so don't screenshot or record them. NEVER close the RevolutionEHR tab (closing signs the user out). Never click Confirm/Start/Reschedule/No-show/Cancel/Save in RevolutionEHR. After rebuilding, the user must reload the extension (chrome://extensions) before a live check.
- Shell pitfalls seen in this project: use the Write tool for files with backslashes or regexes (a `node -e` with `\s` once turned into `s` and broke the provider name); do not `rm -rf .scratch` while the shell is inside it (it aborts a `&&` chain and the later steps silently don't run); `npm i preact` once pulled Preact 11, which ignores style objects: it is pinned to 10.x.
- Memory/notes: update TODO.md and the memory file `project_rosebud.md` when done.
