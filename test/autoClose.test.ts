import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { autoClose, FADE_AFTER_MS, FADE_MS, fadesOnItsOwn } from '../src/ui/autoClose.js';

test('only a plain "done" message closes itself', () => {
  assert.equal(fadesOnItsOwn({ kind: 'done', warnings: [] }), true);
  assert.equal(fadesOnItsOwn({ kind: 'done', warnings: ['Balance could not be read; left blank.'] }), false);
  assert.equal(fadesOnItsOwn({ kind: 'done', warnings: [], pdfUrl: 'blob:x' }), false); // the tab was blocked: the link must stay
  assert.equal(fadesOnItsOwn({ kind: 'fail' }), false);
  assert.equal(fadesOnItsOwn({ kind: 'working' }), false);
});

function clock() {
  mock.timers.enable({ apis: ['setTimeout'] });
  const log: string[] = [];
  const t = autoClose((f) => log.push(f ? 'fade' : 'unfade'), () => log.push('close'));
  return { t, log, tick: (ms: number) => mock.timers.tick(ms) };
}

test('fades after 5 seconds, then closes when the fade is done', () => {
  const { log, tick } = clock();
  try {
    tick(FADE_AFTER_MS - 1);
    assert.deepEqual(log, []);
    tick(1);
    assert.deepEqual(log, ['fade']);
    tick(FADE_MS);
    assert.deepEqual(log, ['fade', 'close']);
  } finally {
    mock.timers.reset();
  }
});

test('the mouse over the message holds it; leaving starts the full wait again', () => {
  const { t, log, tick } = clock();
  try {
    tick(4000);
    t.pause();
    tick(60_000);
    assert.deepEqual(log, []);
    t.resume();
    tick(FADE_AFTER_MS - 1);
    assert.deepEqual(log, []);
    tick(1);
    tick(FADE_MS);
    assert.deepEqual(log, ['fade', 'close']);
  } finally {
    mock.timers.reset();
  }
});

test('hovering during the fade brings the message back', () => {
  const { t, log, tick } = clock();
  try {
    tick(FADE_AFTER_MS + FADE_MS / 2);
    t.pause();
    tick(FADE_MS * 10);
    assert.deepEqual(log, ['fade', 'unfade']);
    t.cancel();
  } finally {
    mock.timers.reset();
  }
});
