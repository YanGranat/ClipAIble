import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPdfData, savePdfData } from '../../scripts/api/pdf-storage.js';

let records;
let close;
beforeEach(() => {
  records = new Map();
  close = vi.fn();
  const database = { close, transaction() {
    let aborted = false;
    const tx = { objectStore: () => ({
      put: record => records.set(record.url, record),
      get: ref => {
        const request = {};
        queueMicrotask(() => { request.result = records.get(ref); request.onsuccess?.(); });
        return request;
      }
    }), abort: () => { aborted = true; queueMicrotask(() => tx.onabort?.()); } };
    queueMicrotask(() => queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); }));
    return tx;
  } };
  vi.stubGlobal('indexedDB', { open: () => {
    const request = {};
    queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
    return request;
  } });
});
afterEach(() => vi.unstubAllGlobals());
it('returns validated captured bytes and closes each completed transaction', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\n').buffer;
  await savePdfData('pdf-render:sample', bytes, 'active-run');
  expect(await getPdfData('pdf-render:sample')).toBe(bytes);
  expect(records.get('pdf-render:sample').processingRunId).toBe('active-run');
  expect(close).toHaveBeenCalledTimes(2);
});
it('settles a corrupt stored record as a rejected read without an uncaught event error', async () => {
  records.set('pdf-render:sample', { data: new TextEncoder().encode('broken').buffer });
  await expect(getPdfData('pdf-render:sample')).rejects.toThrow('Invalid PDF header');
  expect(close).toHaveBeenCalledOnce();
});
