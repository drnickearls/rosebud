import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'America/New_York'; // the practice's clock, before any Date is made

const { localWhen, startsOn } = await import('../src/ehr/api.js');

test('service times (UTC) become the practice clock, daylight saving included', () => {
  assert.deepEqual(localWhen('2026-10-13T12:50:00Z'), { date: { year: 2026, month: 10, day: 13 }, time: '8:50 AM' }); // EDT
  assert.deepEqual(localWhen('2026-12-25T14:00:00Z'), { date: { year: 2026, month: 12, day: 25 }, time: '9:00 AM' }); // EST
  assert.deepEqual(localWhen('2026-10-14T01:00:00Z'), { date: { year: 2026, month: 10, day: 13 }, time: '9:00 PM' }); // evening is still the 13th
  assert.equal(localWhen('2026-10-13T16:00:00Z').time, '12:00 PM');
  assert.equal(localWhen('2026-10-13T04:05:00Z').time, '12:05 AM');
});

test('startsOn compares the local day', () => {
  assert.equal(startsOn('2026-10-14T01:00:00Z', { year: 2026, month: 10, day: 13 }), true);
  assert.equal(startsOn('2026-10-14T01:00:00Z', { year: 2026, month: 10, day: 14 }), false);
});
