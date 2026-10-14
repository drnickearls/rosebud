import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanExamType, parseNextApptText, parseRfv } from '../src/core/appointment.js';
import { ageOn, balanceText, firstLast, lastNameOnly, formValues, parseUsDate, reasonLine, timeToMinutes } from '../src/core/format.js';
import { groupByProvider, type ScheduleEntry } from '../src/core/schedule.js';

test('lastNameOnly keeps the part before the comma', () => {
  assert.equal(lastNameOnly('Dumbledore, Albus'), 'Dumbledore');
  assert.equal(lastNameOnly('  Bollier-Smith ,  Dan '), 'Bollier-Smith');
  assert.equal(lastNameOnly('Earls, Nick'), 'Earls'); // a last name ending in s stays whole
  assert.equal(lastNameOnly('Weiss,  Susan'), 'Weiss');
  assert.equal(lastNameOnly('Cher'), 'Cher');
  assert.equal(lastNameOnly(''), '');
});

test('firstLast flips "Last, First"', () => {
  assert.equal(firstLast('Potter, Harry'), 'Harry Potter');
  assert.equal(firstLast('  Granger,   Hermione  '), 'Hermione Granger');
  assert.equal(firstLast('Cher'), 'Cher');
});

test('ageOn: whole years, months under two years, birthday not yet reached', () => {
  const dob = { year: 1980, month: 7, day: 31 };
  assert.equal(ageOn(dob, { year: 2026, month: 10, day: 13 }), '46');
  assert.equal(ageOn(dob, { year: 2026, month: 7, day: 30 }), '45');
  assert.equal(ageOn(dob, { year: 2026, month: 7, day: 31 }), '46');
  const baby = { year: 2025, month: 8, day: 20 };
  assert.equal(ageOn(baby, { year: 2026, month: 10, day: 13 }), '13 mo');
  assert.equal(ageOn(baby, { year: 2026, month: 10, day: 20 }), '14 mo');
  assert.equal(ageOn(baby, { year: 2027, month: 8, day: 19 }), '23 mo');
  assert.equal(ageOn(baby, { year: 2027, month: 8, day: 20 }), '2');
});

test('balanceText prints 0 at zero, two decimals otherwise, nothing when unreadable', () => {
  assert.equal(balanceText('$0.00'), '0');
  assert.equal(balanceText('0'), '0');
  assert.equal(balanceText(null), '');
  assert.equal(balanceText('$12.5'), '12.50');
  assert.equal(balanceText('$1,234.50'), '1234.50');
  assert.equal(balanceText('-$5.00'), '');
});

test('dates and times', () => {
  assert.deepEqual(parseUsDate('07/31/1980 (46 Years)'), { year: 1980, month: 7, day: 31 });
  assert.equal(parseUsDate('nope'), null);
  assert.equal(timeToMinutes('9:00 PM'), 21 * 60);
  assert.equal(timeToMinutes('12:05 AM'), 5);
  assert.equal(timeToMinutes('12:30 PM'), 12 * 60 + 30);
  });

test('Next Appt text', () => {
  assert.deepEqual(parseNextApptText('Tuesday 10/13/2026 at 9:00 PM'), { date: { year: 2026, month: 10, day: 13 }, time: '9:00 PM' });
  assert.equal(parseNextApptText('No appointments scheduled at this time.'), null);
});

test('exam type drops bracketed detail', () => {
  assert.equal(cleanExamType('Cataract Post Op Exam (1. Cataract Post Op)'), 'Cataract Post Op Exam');
  assert.equal(cleanExamType('Refraction (Rx Check)'), 'Refraction');
  assert.equal(cleanExamType('Long Medical'), 'Long Medical');
});

test('RFV: first one, any case, any separator, to the line break', () => {
  assert.equal(parseRfv('RFV: 1 month post op\noriginal surgery 8-11-26\nco-management forms scanned in'), '1 month post op');
  assert.equal(parseRfv('10/01- LVM, pt to confirm 48 hrs-rr'), null);
  assert.equal(parseRfv('rfv - dry eyes. itchy'), 'dry eyes. itchy');
  assert.equal(parseRfv('RFV red eye'), 'red eye');
  assert.equal(parseRfv('called back\r\npt here for RFV: floaters\r\nother'), 'floaters');
  assert.equal(parseRfv('RFV:\nsecond line'), null);
  assert.equal(parseRfv('RFV: first\nRFV: second'), 'first');
  assert.equal(parseRfv('PRFV x'), null);
  assert.equal(parseRfv(''), null);
});

test('Reason For Visit line', () => {
  assert.equal(reasonLine('Cataract Post Op Exam', '1 month post op'), 'Cataract Post Op Exam — 1 month post op');
  assert.equal(reasonLine('Long Medical', null), 'Long Medical');
});

test('formValues puts it together', () => {
  const v = formValues(
    { chartName: 'Potter, Harry', dob: { year: 1980, month: 7, day: 31 }, patientId: '117820477', patientBalance: '$0.00' },
    { provider: 'Dumbledore, Albus', date: { year: 2026, month: 10, day: 13 }, time: '9:00 PM', examType: 'Long Medical', rfv: null },
  );
  assert.deepEqual(v, {
    provider: 'Dumbledore',
    date: '10/13/2026',
    appointmentTime: '9:00 PM',
    name: 'Harry Potter',
    dob: '07/31/1980',
    age: '46',
    patientId: '117820477',
    balanceDue: '0',
    reasonForVisit: 'Long Medical',
  });
});

test('groupByProvider: provider first (screen order), then time, one per patient', () => {
  const e = (provider: string, time: string, chartName: string): ScheduleEntry => ({ provider, time, chartName, patientId: chartName });
  const groups = groupByProvider(
    [e('B', '8:00 AM', 'Bee, Al'), e('A', '9:00 AM', 'Ay, Bo'), e('A', '8:00 AM', 'Cee, Di'), e('B', '8:30 AM', 'Bee, Al'), e('A', '1:00 PM', 'Ee, Fy')],
    ['A', 'B'],
  );
  assert.deepEqual(groups.map((g) => [g.provider, g.entries.map((x) => x.chartName)]), [
    ['A', ['Cee, Di', 'Ay, Bo', 'Ee, Fy']],
    ['B', ['Bee, Al']],
  ]);
  assert.equal(groups[1]!.entries[0]!.time, '8:00 AM');
});
