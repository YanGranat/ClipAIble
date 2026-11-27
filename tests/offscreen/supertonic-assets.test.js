import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SUPERTONIC_CACHE, SUPERTONIC_MODEL_URL, SUPERTONIC_FALLBACK_URL, SUPERTONIC_DOWNLOAD_BYTES } from '../../scripts/api/supertonic-config.js';
import { deleteSupertonicAssets, installSupertonicAssets, isSupertonicInstalled, readSupertonicAsset } from '../../scripts/offscreen/supertonic/assets.js';

vi.mock('../../scripts/api/supertonic-config.js', () => ({
  SUPERTONIC_CACHE: 'test-voice-cache',
  SUPERTONIC_MODEL_URL: 'https://huggingface.co/example/voice/resolve/one/',
  SUPERTONIC_FALLBACK_URL: 'https://huggingface.co/example/alternate/resolve/two/',
  SUPERTONIC_DOWNLOAD_BYTES: 401_276_744
}));

vi.mock('../../scripts/offscreen/supertonic/model-files.js', () => ({
  SUPERTONIC_FILES: [
    ['first.onnx', 3, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['second.onnx', 3, 'cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34']
  ]
}));

let files, cache;
const url = (base, name) => base + name + '.onnx';
const decoder = new TextDecoder();

beforeEach(() => {
  files = new Map();
  cache = {
    match: async key => files.get(key)?.clone(),
    delete: async key => files.delete(key),
    put: async (key, value) => files.set(key, value.clone()),
    keys: async () => [...files.keys()].map(url => ({ url }))
  };
  vi.stubGlobal('caches', { has: async () => true, open: async () => cache,
    match: async (key, { cacheName }) => cacheName === SUPERTONIC_CACHE ? cache.match(key) : undefined,
    delete: async name => { if (name !== SUPERTONIC_CACHE) throw new Error('Unexpected cache'); files.clear(); return true; } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('falls back to the other fixed source if primary bytes fail verification', async () => {
  fetch.mockImplementation(async request => new Response(request === url(SUPERTONIC_MODEL_URL, 'first') ? 'xxx' : request.endsWith('first.onnx') ? 'abc' : 'def'));
  const progress = vi.fn();
  await installSupertonicAssets(new AbortController().signal, progress);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([url(SUPERTONIC_MODEL_URL, 'first'), url(SUPERTONIC_FALLBACK_URL, 'first'), url(SUPERTONIC_MODEL_URL, 'second')]);
  expect(progress).toHaveBeenLastCalledWith(6);
  expect(await isSupertonicInstalled()).toBe(true);
  expect(decoder.decode(await readSupertonicAsset('first.onnx'))).toBe('abc');
  await deleteSupertonicAssets();
  expect(await isSupertonicInstalled()).toBe(false);
  await expect(readSupertonicAsset('first.onnx')).rejects.toThrow('missing');
});

it('does not mark an incomplete installation ready and reuses an already verified part on retry', async () => {
  fetch.mockImplementation(async request => request.endsWith('first.onnx') ? new Response('abc') : new Response('x', { status: 404 }));
  await expect(installSupertonicAssets(new AbortController().signal, vi.fn())).rejects.toThrow();
  expect(await isSupertonicInstalled()).toBe(false);
  expect(files.size).toBe(1);
  fetch.mockReset().mockImplementation(async () => new Response('def'));
  await installSupertonicAssets(new AbortController().signal, vi.fn());
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe(url(SUPERTONIC_MODEL_URL, 'second'));
  expect(await isSupertonicInstalled()).toBe(true);
  files.delete(url(SUPERTONIC_MODEL_URL, 'first'));
  expect(await isSupertonicInstalled()).toBe(false);
});

it('cancels without falling back, marking the installation ready or making unexpected network requests', async () => {
  const controller = new AbortController();
  fetch.mockImplementationOnce(async () => { controller.abort(); throw controller.signal.reason; });
  await expect(installSupertonicAssets(controller.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledOnce();
  expect(await isSupertonicInstalled()).toBe(false);
  await expect(readSupertonicAsset('https://example.org/unknown.onnx')).rejects.toThrow('Unknown');
  expect(fetch).toHaveBeenCalledOnce();
});

it('matches the displayed download size to the pinned model files', async () => {
  const { SUPERTONIC_FILES } = await vi.importActual('../../scripts/offscreen/supertonic/model-files.js');
  expect(SUPERTONIC_FILES.reduce((total, [, bytes]) => total + bytes, 0)).toBe(SUPERTONIC_DOWNLOAD_BYTES);
});
