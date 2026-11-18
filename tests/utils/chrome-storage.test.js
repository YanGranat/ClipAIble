import { beforeEach, expect, it } from 'vitest';
import { createChromeStorage } from '../helpers/chrome-storage.js';

let storage, runtime;
beforeEach(() => { runtime = {}; storage = createChromeStorage(runtime); });

it('stores Chrome-serialized snapshots instead of retaining object references', async () => {
  const input = { nested: { value: 1, missing: undefined }, array: [undefined, NaN, Infinity], absent: undefined, invalid: NaN, date: new Date('2001-01-01T00:00:00Z'), regex: /sample/i };
  const pending = storage.local.set(input);
  input.nested.value = 9;
  await pending;
  const stored = await storage.local.get();
  expect(stored).toEqual({ nested: { value: 1 }, array: [null, null, null], date: {}, regex: {} });
  stored.nested.value = 7;
  expect((await storage.local.get('nested')).nested.value).toBe(1);
  const selected = await storage.local.get('nested');
  selected.nested.value = 8;
  expect((await storage.local.get('nested')).nested.value).toBe(1);
});

it('supports defaults and omits absent keys without replacing existing values', async () => {
  await storage.local.set({ retained: false });
  await storage.local.set({ retained: undefined });
  expect(await storage.local.get({ retained: true, absent: 'fallback' })).toEqual({ retained: false, absent: 'fallback' });
  expect(await storage.local.get(['missing'])).toEqual({});
  const keys = ['retained'];
  const pending = storage.local.get(keys);
  keys[0] = 'missing';
  expect(await pending).toEqual({ retained: false });
});

it('implements callback returns separately from Promise returns', async () => {
  let completed = false;
  const value = storage.local.set({ a: 1 }, () => { completed = true; });
  expect(value).toBeUndefined();
  expect(completed).toBe(false);
  await Promise.resolve();
  expect(completed).toBe(true);
  await expect(storage.local.get('a')).resolves.toEqual({ a: 1 });
});

it('reports callback failure inside its owner and Promise failure by rejection', async () => {
  storage.failNext('get', 'First failure');
  storage.failNext('get', 'Second failure');
  const seen = [];
  await new Promise(resolve => {
    storage.local.get(null, value => { seen.push([runtime.lastError.message, value]); });
    storage.local.get(null, value => { seen.push([runtime.lastError.message, value]); resolve(); });
  });
  expect(seen).toEqual([['First failure', undefined], ['Second failure', undefined]]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(runtime.lastError).toBeUndefined();
  storage.failNext('set');
  await expect(storage.local.set({ a: 1 })).rejects.toThrow('Synthetic storage failure');
  expect(runtime.lastError).toBeUndefined();
  expect(await storage.local.get('a')).toEqual({});
});

it('emits cloned changes and preserves an independent key during remove', async () => {
  const changes = [];
  storage.onChanged.addListener((value, area) => { changes.push({ value, area }); });
  await storage.local.set({ a: { value: 1 }, b: 2 });
  await storage.local.remove('a');
  expect(await storage.local.get()).toEqual({ b: 2 });
  expect(changes[0]).toEqual({ value: { a: { newValue: { value: 1 } }, b: { newValue: 2 } }, area: 'local' });
  expect(changes[1].value).toEqual({ a: { oldValue: { value: 1 } } });
  changes[0].value.b.newValue = 99;
  expect((await storage.local.get('b')).b).toBe(2);
});

it('serializes repeated ancestor references as null and keeps prototype keys as data', async () => {
  const cycle = {}; cycle.self = cycle;
  await storage.local.set({ cycle, ...JSON.parse('{"__proto__":{"value":1}}') });
  const stored = await storage.local.get();
  expect(stored.cycle).toEqual({ self: null });
  expect(Object.hasOwn(stored, '__proto__')).toBe(true);
  expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
});
