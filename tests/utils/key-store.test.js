import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let savedKey;
let failWrite;
let pendingWrite;
let finishWrite;
let closed;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  savedKey = undefined;
  failWrite = false;
  pendingWrite = false;
  finishWrite = undefined;
  closed = vi.fn();
  const queues = new Map();
  vi.stubGlobal('navigator', { locks: { request: vi.fn((name, operation) => {
    const result = (queues.get(name) || Promise.resolve()).catch(() => {}).then(operation);
    queues.set(name, result);
    return result;
  }) } });
  vi.stubGlobal('indexedDB', { open: () => {
    const request = {};
    queueMicrotask(() => {
      request.result = { close: closed, transaction: (_name, mode) => {
        const transaction = { objectStore: () => ({
          get: () => {
            const read = {};
            queueMicrotask(() => { read.result = savedKey; read.onsuccess(); transaction.oncomplete(); });
            return read;
          },
          put: key => {
            finishWrite = () => {
              if (failWrite) transaction.onerror();
              else { savedKey = key; transaction.oncomplete(); }
            };
            if (!pendingWrite) queueMicrotask(finishWrite);
          }
        }) };
        return transaction;
      } };
      request.onsuccess();
    });
    return request;
  } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('does not create a replacement key when decrypting storage from another installation', async () => {
  const generate = vi.spyOn(webcrypto.subtle, 'generateKey');
  const { getInstallationKey } = await import('../../scripts/utils/security/key-store.js');
  await expect(getInstallationKey(false)).rejects.toThrow('unavailable');
  expect(generate).not.toHaveBeenCalled();
  expect(savedKey).toBeUndefined();
  expect(closed).toHaveBeenCalledOnce();
});

it('commits one nonextractable key before either concurrent caller can use it', async () => {
  pendingWrite = true;
  const generate = vi.spyOn(webcrypto.subtle, 'generateKey');
  const { getInstallationKey } = await import('../../scripts/utils/security/key-store.js');
  let firstReady = false;
  const first = getInstallationKey(true).then(key => { firstReady = true; return key; });
  const second = getInstallationKey(true);
  await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
  expect(firstReady).toBe(false);
  expect(savedKey).toBeUndefined();
  finishWrite();
  const [a, b] = await Promise.all([first, second]);
  expect(a).toBe(b);
  expect(a).toBe(savedKey);
  expect(a.extractable).toBe(false);
  await expect(webcrypto.subtle.exportKey('raw', a)).rejects.toThrow();
  expect(generate).toHaveBeenCalledOnce();
});

it('does not cache a key whose persistence failed and allows a later retry', async () => {
  failWrite = true;
  const generate = vi.spyOn(webcrypto.subtle, 'generateKey');
  const { getInstallationKey } = await import('../../scripts/utils/security/key-store.js');
  await expect(getInstallationKey(true)).rejects.toThrow('write failed');
  expect(savedKey).toBeUndefined();
  failWrite = false;
  const key = await getInstallationKey(true);
  expect(key).toBe(savedKey);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(closed).toHaveBeenCalledTimes(2);
});

it('rejects an extractable or incompatible stored key', async () => {
  savedKey = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const { getInstallationKey } = await import('../../scripts/utils/security/key-store.js');
  await expect(getInstallationKey()).rejects.toThrow('Invalid API encryption key');
  expect(closed).toHaveBeenCalledOnce();
});
