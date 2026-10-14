import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'America/Indiana/Indianapolis'; // the practice's clock, before any Date is made

const { datePart, localWhen, toAppointment, toPatient } = await import('../src/ehr/revolution.js');
const { sidebarStartTime } = await import('../src/ehr/screen.js');

// Shapes as RevolutionEHR's services sent them for the fake patient Potter, Albus (2026-10-14).

test('service times (UTC) become the practice clock, daylight saving included', () => {
  assert.deepEqual(localWhen('2026-10-13T12:50:00Z'), { date: { year: 2026, month: 10, day: 13 }, time: '8:50 AM' }); // EDT
  assert.deepEqual(localWhen('2026-12-25T14:00:00Z'), { date: { year: 2026, month: 12, day: 25 }, time: '9:00 AM' }); // EST
  assert.deepEqual(localWhen('2026-10-14T01:00:00Z'), { date: { year: 2026, month: 10, day: 13 }, time: '9:00 PM' }); // evening is still the 13th
  assert.equal(localWhen('2026-10-13T16:00:00Z').time, '12:00 PM');
  assert.equal(localWhen('2026-10-13T04:05:00Z').time, '12:05 AM');
});

test('a birth date is its date part, never moved by the time zone', () => {
  assert.deepEqual(datePart('2008-01-05T18:00:00Z'), { year: 2008, month: 1, day: 5 });
  assert.deepEqual(datePart('2008-01-05T02:00:00Z'), { year: 2008, month: 1, day: 5 }); // would be the 4th on the local clock
  assert.deepEqual(datePart('1980-07-31'), { year: 1980, month: 7, day: 31 });
  assert.equal(datePart(null), null);
});

test('the patient: names trimmed, Last Exam on the local day, next appointment on the local clock', () => {
  const patient = toPatient(
    { name: { lastName: 'Potter', firstName: 'Albus ' }, dateOfBirth: '2008-01-05T18:00:00Z', primaryLocation: { id: 7 } },
    {
      lastEncounterResponse: { encounterDate: '2024-05-30T14:31:38Z' },
      nextAppointmentResponse: { appointmentId: 501, startDate: '2026-12-25T14:00:00Z', templateName: 'Long Medical', provider: { lastName: 'Jones ', firstName: 'Hestia' } },
    },
  );
  assert.deepEqual(patient, {
    chartName: 'Potter, Albus',
    dob: { year: 2008, month: 1, day: 5 },
    lastExam: { year: 2024, month: 5, day: 30 },
    next: { id: 501, date: { year: 2026, month: 12, day: 25 }, time: '9:00 AM', examType: 'Long Medical', provider: 'Jones, Hestia' },
    primaryLocationId: 7,
  });
  assert.deepEqual(
    toPatient({ name: null, dateOfBirth: null, primaryLocation: null }, { lastEncounterResponse: null, nextAppointmentResponse: null }),
    { chartName: '', dob: null, lastExam: null, next: null, primaryLocationId: null },
  );
});

test('a day-list appointment', () => {
  assert.deepEqual(
    toAppointment({
      scheduleItemId: 9,
      startDate: '2026-09-27T13:00:00Z',
      status: 0,
      patientName: { lastName: 'Potter', firstName: 'Harry ', patientId: 117820477 },
      provider: { lastName: 'Dumbledore', firstName: 'Albus' },
      patientDob: '1980-07-31',
      template: 'Long Medical',
    }),
    {
      id: 9,
      patientId: '117820477',
      chartName: 'Potter, Harry',
      dob: { year: 1980, month: 7, day: 31 },
      provider: 'Dumbledore, Albus',
      date: { year: 2026, month: 9, day: 27 },
      time: '9:00 AM',
      status: 0,
      examType: 'Long Medical',
    },
  );
});

test("the Appointment panel's start time", () => {
  assert.equal(sidebarStartTime('Potter, Harry #117820477 Tue October 13, 20269:00 PM - 9:10 PM COMPLETED'), '9:00 PM');
  assert.equal(sidebarStartTime('no time here'), null);
});
