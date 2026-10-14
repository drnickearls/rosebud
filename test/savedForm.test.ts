import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledAssets } from '../src/core/assets.js';
import { stringifyPackage } from '../src/core/form.js';
import { createSavedForm, type FormStorage } from '../src/savedForm/index.js';

function memoryStorage(initial: string | null = null) {
  const store = {
    text: initial,
    read: async () => store.text,
    write: async (text: string) => {
      store.text = text;
    },
    remove: async () => {
      store.text = null;
    },
  };
  return store;
}

const renamed = { ...bundledAssets, template: { ...bundledAssets.template, name: 'Front desk form' } };

test('nothing saved: the built-in form, no problem', async () => {
  const loaded = await createSavedForm(memoryStorage()).load();
  assert.equal(loaded.custom, false);
  assert.equal(loaded.problem, null);
  assert.equal(loaded.assets, bundledAssets);
});

test('save, load, reset', async () => {
  const storage = memoryStorage();
  const form = createSavedForm(storage);
  await form.save(renamed);
  const loaded = await form.load();
  assert.equal(loaded.custom, true);
  assert.equal(loaded.assets.template.name, 'Front desk form');
  assert.deepEqual(loaded.assets.blankPdf, bundledAssets.blankPdf);
  await form.reset();
  assert.equal(storage.text, null);
  assert.equal((await form.load()).custom, false);
});

test('a saved form that is damaged falls back to the built-in one and says why', async () => {
  const loaded = await createSavedForm(memoryStorage('{"format":"rosebud-form"')).load();
  assert.equal(loaded.custom, false);
  assert.equal(loaded.assets, bundledAssets);
  assert.match(loaded.problem!, /could not be read, so the built-in form was used \(That file isn't a Rosebud form file\)\./);
});

test('storage that fails to answer falls back too, and says why', async () => {
  const broken: FormStorage = { read: () => Promise.reject(new Error("the extension didn't answer; reload the page")), write: async () => {}, remove: async () => {} };
  const loaded = await createSavedForm(broken).load();
  assert.equal(loaded.custom, false);
  assert.match(loaded.problem!, /didn't answer; reload the page/);
});

test('a save the browser refuses says what to do', async () => {
  const full: FormStorage = { read: async () => null, write: () => Promise.reject(new Error('QUOTA_BYTES')), remove: async () => {} };
  await assert.rejects(createSavedForm(full).save(bundledAssets), /Use Export to keep a copy/);
});

test('a saved form is the same file as an exported one', async () => {
  const storage = memoryStorage();
  await createSavedForm(storage).save(renamed);
  assert.equal(storage.text, stringifyPackage(renamed));
});
