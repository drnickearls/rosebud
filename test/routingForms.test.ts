import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledAssets } from '../src/core/assets.js';
import type { CalendarDate, FormValues, PrintPart } from '../src/core/types.js';
import type { Appointment, Patient } from '../src/routingForms/ehr.js';
import { createRoutingForms, UserError, type PrintChoice } from '../src/routingForms/index.js';
import { dayKey, FakeEhr, type FakeData } from './fakeEhr.js';

// Made-up patients only: the repo is public.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 14 };
const XMAS: CalendarDate = { year: 2026, month: 12, day: 25 };
const LOCATION = 7;
const ALBUS = '117821028';

const albus = (over: Partial<Patient> = {}): Patient => ({
  chartName: 'Potter, Albus ', // the service leaves a trailing space on the first name
  dob: { year: 2008, month: 1, day: 5 },
  lastExam: { year: 2024, month: 5, day: 30 },
  next: null,
  primaryLocationId: LOCATION,
  ...over,
});

const nextXmas = { id: 501, date: XMAS, time: '9:00 AM', examType: 'Long Medical (1. Annual)', provider: 'Dumbledore, Albus' };

let ids = 1000;
const appt = (patientId: string, chartName: string, provider: string, time: string, over: Partial<Appointment> = {}): Appointment => ({
  id: ++ids,
  patientId,
  chartName,
  dob: { year: 1980, month: 7, day: 31 },
  provider,
  date: TODAY,
  time,
  status: 0,
  examType: 'Long Medical',
  ...over,
});

function setup(data: FakeData, problem: string | null = null) {
  const ehr = new FakeEhr(data);
  let formLoads = 0;
  const forms = createRoutingForms({
    ehr,
    form: async () => {
      formLoads++;
      return { assets: bundledAssets, problem };
    },
    now: () => TODAY,
  });
  const controller = new AbortController();
  const messages: string[] = [];
  const print = (choice: PrintChoice) => forms.print(choice, { signal: controller.signal, progress: (m) => void messages.push(m) });
  return { ehr, forms, controller, messages, print, formLoads: () => formLoads };
}

const formsOf = (parts: PrintPart[]): FormValues[] => parts.flatMap((p) => (p.kind === 'form' ? [p.values] : []));
const outline = (parts: PrintPart[]) => parts.map((p) => (p.kind === 'cover' ? `cover ${p.cover.provider}` : `${p.values.name} ${p.values.appointmentTime}`));
const isUserError = (message: RegExp) => (e: unknown) => e instanceof UserError && message.test(e.message);
const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

// --- Chart Mode -------------------------------------------------------------------------

test('chart: checked in today with a next appointment offers both, today first', async () => {
  const { ehr, forms } = setup({ patients: { [ALBUS]: albus({ lastExam: TODAY, next: nextXmas }) } });
  ehr.onScreen.patientId = ALBUS;
  const offer = await forms.offer('chart', new AbortController().signal);
  assert.deepEqual(offer, { sources: ['today', 'next'], next: '12/25/2026 at 9:00 AM — Long Medical' });
});

test('chart: checked in today only offers today; neither is a UserError', async () => {
  const { ehr, forms } = setup({ patients: { [ALBUS]: albus({ lastExam: TODAY }), '2': albus() } });
  ehr.onScreen.patientId = ALBUS;
  assert.deepEqual((await forms.offer('chart', new AbortController().signal)).sources, ['today']);
  ehr.onScreen.patientId = '2';
  await assert.rejects(forms.offer('chart', new AbortController().signal), isUserError(/no appointment to print/));
});

test('chart: the next appointment prints every field', async () => {
  const { ehr, print, messages } = setup({
    patients: { [ALBUS]: albus({ next: nextXmas }) },
    balances: { [ALBUS]: 0 },
    details: { 501: { examType: 'Long Medical (1. Annual)', comments: 'called pt\nRFV: blurry at night\nmore notes' } },
  });
  ehr.onScreen.patientId = ALBUS;
  const printed = await print({ mode: 'chart', source: 'next' });
  assert.deepEqual(formsOf(printed.parts), [
    {
      provider: 'Dumbledore',
      date: '12/25/2026',
      appointmentTime: '9:00 AM',
      name: 'Albus Potter',
      dob: '01/05/2008',
      age: '18',
      patientId: ALBUS,
      balanceDue: '0',
      reasonForVisit: 'Long Medical — blurry at night',
    },
  ]);
  assert.equal(printed.count, 1);
  assert.deepEqual(printed.warnings, []);
  assert.deepEqual(messages, ['Reading the appointment…', 'Routing Forms completed: 1 of 1']);
  assert.ok(printed.pdf.length > 1000);
});

test("chart: today's appointment is the earliest shown one at the primary location", async () => {
  const { ehr, print } = setup({
    patients: { [ALBUS]: albus({ lastExam: TODAY }) },
    balances: { [ALBUS]: 12.5 },
    days: {
      [dayKey(TODAY, LOCATION)]: [
        appt(ALBUS, 'Potter, Albus', 'Jones, Hestia', '2:00 PM', { id: 11 }),
        appt(ALBUS, 'Potter, Albus', 'Jones, Hestia', '8:00 AM', { id: 12, status: 2 }), // cancelled: not on the schedule
        appt(ALBUS, 'Potter, Albus', 'Jones, Hestia', '9:30 AM', { id: 13 }),
        appt('3', 'Granger, Hermione', 'Jones, Hestia', '7:00 AM', { id: 14 }),
      ],
    },
    details: { 13: { examType: 'Refraction (Rx Check)', comments: '' } },
  });
  ehr.onScreen.patientId = ALBUS;
  const [form] = formsOf((await print({ mode: 'chart', source: 'today' })).parts);
  assert.equal(form!.appointmentTime, '9:30 AM');
  assert.equal(form!.date, '10/14/2026');
  assert.equal(form!.provider, 'Jones'); // a last name ending in s stays whole
  assert.equal(form!.reasonForVisit, 'Refraction');
  assert.equal(form!.balanceDue, '12.50');
});

test('chart: a second appointment the same day can be chosen as the next one', async () => {
  const later = { ...nextXmas, id: 600, date: TODAY, time: '3:00 PM' };
  const { ehr, forms, print } = setup({
    patients: { [ALBUS]: albus({ lastExam: TODAY, next: later }) },
    balances: { [ALBUS]: 0 },
    days: { [dayKey(TODAY, LOCATION)]: [appt(ALBUS, 'Potter, Albus', 'Jones, Hestia', '9:30 AM', { id: 21 }), appt(ALBUS, 'Potter, Albus', 'Dumbledore, Albus', '3:00 PM', { id: 600 })] },
    details: { 21: { examType: null, comments: '' }, 600: { examType: null, comments: '' } },
  });
  ehr.onScreen.patientId = ALBUS;
  assert.deepEqual((await forms.offer('chart', new AbortController().signal)).sources, ['today', 'next']);
  assert.equal(formsOf((await print({ mode: 'chart', source: 'today' })).parts)[0]!.appointmentTime, '9:30 AM');
  assert.equal(formsOf((await print({ mode: 'chart', source: 'next' })).parts)[0]!.appointmentTime, '3:00 PM');
});

test("chart: today's appointment not found, balance and detail unreadable: blanks and warnings, still prints", async () => {
  const { ehr, print } = setup({ patients: { [ALBUS]: albus({ lastExam: TODAY, dob: null }) } });
  ehr.onScreen.patientId = ALBUS;
  ehr.failures.set(`balance ${ALBUS}`, new Error('RevolutionEHR answered 500'));
  const printed = await print({ mode: 'chart', source: 'today' });
  const [form] = formsOf(printed.parts);
  assert.deepEqual([form!.appointmentTime, form!.reasonForVisit, form!.balanceDue, form!.dob, form!.age, form!.provider], ['', '', '', '', '', '']);
  assert.equal(form!.date, '10/14/2026');
  assert.equal(printed.warnings.length, 3);
  assert.match(printed.warnings.join('\n'), /balance.*500/);
  assert.match(printed.warnings.join('\n'), /Albus Potter is not on today's schedule/);
  assert.match(printed.warnings.join('\n'), /no date of birth/);
});

test("chart: the next appointment's detail unreadable falls back to its exam type", async () => {
  const { ehr, print } = setup({ patients: { [ALBUS]: albus({ next: nextXmas }) }, balances: { [ALBUS]: 0 } });
  ehr.onScreen.patientId = ALBUS;
  ehr.failures.set('detail 501', new Error('RevolutionEHR answered 403'));
  const printed = await print({ mode: 'chart', source: 'next' });
  assert.equal(formsOf(printed.parts)[0]!.reasonForVisit, 'Long Medical');
  assert.match(printed.warnings[0]!, /reason for visit.*403/);
});

// --- Schedule Mode ----------------------------------------------------------------------

function scheduleDay(day: Appointment[], over: Partial<FakeData> = {}, problem: string | null = null) {
  const balances: Record<string, number> = {};
  const details: FakeData['details'] = {};
  for (const a of day) {
    balances[a.patientId] = 0;
    details[a.id] = { examType: null, comments: '' };
  }
  const s = setup({ days: { [dayKey(TODAY, LOCATION)]: day }, balances, details, ...over }, problem);
  s.ehr.onScreen.schedule = { date: TODAY, providers: ['Jones, Hestia', 'Dumbledore, Albus', 'Snape, Severus'], locationId: LOCATION };
  return s;
}

test('schedule: providers in screen order, each behind a cover page, one earliest form per patient', async () => {
  const s = scheduleDay([
    appt('1', 'Potter, Harry', 'Dumbledore, Albus', '10:00 AM'),
    appt('1', 'Potter, Harry', 'Dumbledore, Albus', '8:00 AM'),
    appt('2', 'Doe, Jane', 'Dumbledore, Albus', '9:00 AM'),
    appt('1', 'Potter, Harry', 'Jones, Hestia', '1:00 PM'),
    appt('3', 'Test, Tom', 'Jones, Hestia', '11:00 AM'),
    appt('4', 'Granger, Hermione', 'Snape, Severus', '9:00 AM'), // provider not chosen
  ]);
  const printed = await s.print({ mode: 'schedule', providers: ['Jones, Hestia', 'Dumbledore, Albus'] });
  assert.deepEqual(outline(printed.parts), [
    'cover Jones, Hestia',
    'Tom Test 11:00 AM',
    'Harry Potter 1:00 PM',
    'cover Dumbledore, Albus',
    'Harry Potter 8:00 AM',
    'Jane Doe 9:00 AM',
  ]);
  assert.equal(printed.count, 4);
  const cover = printed.parts[3]!;
  assert.ok(cover.kind === 'cover');
  assert.deepEqual(cover.cover, {
    provider: 'Dumbledore, Albus',
    dateLabel: 'Wednesday 10/14/2026',
    rows: [
      { time: '8:00 AM', name: 'Harry Potter', examType: 'Long Medical' },
      { time: '9:00 AM', name: 'Jane Doe', examType: 'Long Medical' },
    ],
  });
  assert.deepEqual(s.messages.slice(0, 1), ['Reading the schedule…']);
  assert.ok(s.messages.includes('Gathering patient details: 4 of 4'));
  assert.equal(s.messages.at(-1), 'Routing Forms completed: 4 of 4');
});

test('schedule: cancelled, rescheduled and no-show statuses (2, 5, 6) never print', async () => {
  const s = scheduleDay([
    appt('1', 'Potter, Harry', 'Jones, Hestia', '8:00 AM', { status: 2 }),
    appt('2', 'Doe, Jane', 'Jones, Hestia', '8:10 AM', { status: 5 }),
    appt('3', 'Test, Tom', 'Jones, Hestia', '8:20 AM', { status: 6 }),
    appt('4', 'Granger, Hermione', 'Jones, Hestia', '8:30 AM', { status: 3 }), // completed: on the schedule
    appt('5', 'Weasley, Ron', 'Jones, Hestia', '8:40 AM', { status: 9 }), // unfamiliar: kept
  ]);
  const printed = await s.print({ mode: 'schedule', providers: ['Jones, Hestia'] });
  assert.deepEqual(outline(printed.parts), ['cover Jones, Hestia', 'Hermione Granger 8:30 AM', 'Ron Weasley 8:40 AM']);
});

test('schedule: unreadable balance or detail is blank with a warning, missing DOB too, and the rest still prints', async () => {
  const harry = appt('1', 'Potter, Harry', 'Jones, Hestia', '8:00 AM');
  const jane = appt('2', 'Doe, Jane', 'Jones, Hestia', '9:00 AM', { dob: null, examType: 'Cataract Post Op Exam (1. Cataract Post Op)' });
  const s = scheduleDay([harry, jane]);
  s.ehr.failures.set('balance 1', new Error('RevolutionEHR answered 500'));
  s.ehr.failures.set(`detail ${jane.id}`, new Error('RevolutionEHR answered 404'));
  const printed = await s.print({ mode: 'schedule', providers: ['Jones, Hestia'] });
  const [h, j] = formsOf(printed.parts);
  assert.equal(h!.balanceDue, '');
  assert.equal(j!.balanceDue, '0');
  assert.equal(j!.reasonForVisit, 'Cataract Post Op Exam'); // the list's exam type, brackets dropped
  assert.deepEqual([j!.dob, j!.age], ['', '']);
  assert.equal(printed.warnings.length, 3);
});

test('schedule: only the open appointment, with no cover page', async () => {
  const s = scheduleDay([appt('1', 'Potter, Harry', 'Jones, Hestia', '8:00 AM'), appt('1', 'Potter, Harry', 'Dumbledore, Albus', '2:00 PM'), appt('2', 'Doe, Jane', 'Jones, Hestia', '9:00 AM')]);
  s.ehr.onScreen.openAppointment = { patientId: '1', time: '2:00 PM' };
  const offer = await s.forms.offer('schedule', new AbortController().signal);
  assert.deepEqual(offer, { dateLabel: 'Wednesday 10/14/2026', providers: ['Jones, Hestia', 'Dumbledore, Albus', 'Snape, Severus'], openPatient: 'Harry Potter' });
  const printed = await s.print({ mode: 'schedule', openPatient: true });
  assert.deepEqual(outline(printed.parts), ['Harry Potter 2:00 PM']);
});

test("schedule: the schedule's location must have been seen", async () => {
  const s = scheduleDay([]);
  s.ehr.onScreen.schedule = { ...s.ehr.onScreen.schedule!, locationId: null };
  await assert.rejects(s.forms.offer('schedule', new AbortController().signal), isUserError(/refresh button/));
  await assert.rejects(s.print({ mode: 'schedule', providers: ['Jones, Hestia'] }), isUserError(/refresh button/));
});

test('schedule: nobody for the chosen providers is a UserError', async () => {
  const s = scheduleDay([appt('1', 'Potter, Harry', 'Snape, Severus', '8:00 AM')]);
  await assert.rejects(s.print({ mode: 'schedule', providers: ['Jones, Hestia'] }), isUserError(/None of the selected providers/));
});

test('schedule: at most 6 requests in flight', async () => {
  const s = scheduleDay(Array.from({ length: 20 }, (_, i) => appt(String(i + 1), `Patient, No${i}`, 'Jones, Hestia', `8:${String(i).padStart(2, '0')} AM`)));
  const printed = await s.print({ mode: 'schedule', providers: ['Jones, Hestia'] });
  assert.equal(printed.count, 20);
  assert.ok(s.ehr.maxInFlight <= 6 * 2, `max in flight ${s.ehr.maxInFlight}`); // a detail and a balance per patient
  assert.ok(s.ehr.maxInFlight > 2);
});

test('Stop: the run ends with AbortError and nothing is built', async () => {
  const s = scheduleDay(Array.from({ length: 10 }, (_, i) => appt(String(i + 1), `Patient, No${i}`, 'Jones, Hestia', `9:0${i} AM`)));
  s.ehr.onCall = (call) => {
    if (call === 'balance 3') s.controller.abort();
  };
  await assert.rejects(s.print({ mode: 'schedule', providers: ['Jones, Hestia'] }), isAbortError);
  assert.equal(s.formLoads(), 0);
  assert.ok(!s.messages.some((m) => m.startsWith('Routing Forms completed')));
});

test('Stop during Chart Mode is not turned into a warning', async () => {
  const { ehr, print, controller, formLoads } = setup({ patients: { [ALBUS]: albus({ next: nextXmas }) }, balances: { [ALBUS]: 0 } });
  ehr.onScreen.patientId = ALBUS;
  ehr.onCall = (call) => {
    if (call === 'detail 501') controller.abort();
  };
  await assert.rejects(print({ mode: 'chart', source: 'next' }), isAbortError);
  assert.equal(formLoads(), 0);
});

test("a saved form that couldn't be used is reported with the print's warnings", async () => {
  const s = scheduleDay([appt('1', 'Potter, Harry', 'Jones, Hestia', '8:00 AM')], {}, 'The form saved on this computer could not be read, so the built-in form was used.');
  const printed = await s.print({ mode: 'schedule', providers: ['Jones, Hestia'] });
  assert.equal(printed.count, 1);
  assert.deepEqual(printed.warnings, ['The form saved on this computer could not be read, so the built-in form was used.']);
});
