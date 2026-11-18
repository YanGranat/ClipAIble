import { beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { patchPiperTtsSource } from '../../build-piper.js';

const voice = 'en_US-hfc_female-medium';
const modelFile = `${voice}.onnx`, configFile = `${modelFile}.json`;
const config = { espeak: { voice: 'en-us' }, audio: { sample_rate: 22050 }, inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, speaker_id_map: {} };
let bundle;
beforeAll(async () => {
  const sdk = createRequire(import.meta.url).resolve.paths('@mintplex-labs/piper-tts-web')
    .map(base => join(base, '@mintplex-labs/piper-tts-web/dist/piper-tts-web.js')).find(existsSync);
  const result = await build({ entryPoints: [sdk], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Piper', plugins: [{ name: 'supported-sdk', setup(builder) {
    builder.onLoad({ filter: /piper-o91UDS6e\.js$/ }, () => ({ contents: 'export const createPiperPhonemize = () => ({});', loader: 'js' }));
    builder.onLoad({ filter: /piper-tts-web.*\.js$/ }, async args => ({ contents: patchPiperTtsSource(await readFile(args.path, 'utf8'), args.path), loader: 'js' }));
  } }] });
  bundle = result.outputFiles[0].text;
});

function runtime(options = {}) {
  const files = new Map(options.cached ? [[modelFile, new Blob(['model'])], [configFile, new Blob([JSON.stringify(config)])]] : []);
  const writes = [], removals = [];
  const create = vi.fn(options.create || (async () => ({ release: vi.fn(async () => {}) })));
  const directory = {
    async getFileHandle(name, { create: allowCreate } = {}) {
      if (!allowCreate && !files.has(name)) throw new Error('Not found');
      return {
        getFile: async () => files.get(name),
        createWritable: async () => {
          let pending;
          return { write: async blob => { writes.push(name); pending = blob; }, close: async () => { await options.beforeClose?.(name); files.set(name, pending); }, abort: async () => {} };
        }
      };
    },
    removeEntry: async name => { removals.push(name); files.delete(name); }
  };
  const fetch = vi.fn(options.fetch || (async url => new Response(url.endsWith('.json') ? JSON.stringify(config) : 'model', { status: 200 })));
  const context = { Blob, Response, ArrayBuffer, Uint8Array, DataView, Float32Array, console, fetch,
    navigator: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => directory }) } },
    self: { location: { origin: 'chrome-extension://test-extension-id' }, ort: { env: { wasm: {} }, InferenceSession: { create } } } };
  runInNewContext(bundle, context);
  return { sdk: context.Piper, files, writes, removals, create, fetch };
}

describe('Piper model cache admission', () => {
  it('rejects an HTTP error without caching its response or creating a session', async () => {
    const item = runtime({ fetch: async () => new Response('Not a model', { status: 404 }) });
    await expect(item.sdk.download(voice)).rejects.toThrow('HTTP 404');
    expect(item.files.size).toBe(0); expect(item.create).not.toHaveBeenCalled();
  });
  it('rejects a short response whose declared length was not received', async () => {
    const item = runtime({ fetch: async () => new Response('x', { status: 200, headers: { 'Content-Length': '100' } }) });
    await expect(item.sdk.download(voice)).rejects.toThrow('incomplete');
    expect(item.files.size).toBe(0);
  });
  it('rejects partial HTTP ranges and empty model responses', async () => {
    for (const response of [new Response('partial', { status: 206 }), new Response('', { status: 200 })]) {
      const item = runtime({ fetch: async () => response.clone() });
      await expect(item.sdk.download(voice)).rejects.toThrow(); expect(item.files.size).toBe(0);
    }
  });
  it('validates the downloaded ONNX with the actual configured runtime boundary before persistence', async () => {
    const item = runtime({ create: async () => { throw new Error('Invalid ONNX graph'); } });
    await expect(item.sdk.download(voice)).rejects.toThrow('Invalid ONNX graph');
    expect(item.create).toHaveBeenCalledOnce(); expect(item.writes).toEqual([]); expect(item.files.size).toBe(0);
  });
  it('rejects invalid configuration before model admission', async () => {
    const item = runtime({ fetch: async url => new Response(url.endsWith('.json') ? '{}' : 'model') });
    await expect(item.sdk.download(voice)).rejects.toThrow('configuration'); expect(item.files.size).toBe(0); expect(item.create).not.toHaveBeenCalled();
  });
  it('acknowledges download only after both OPFS writable streams close', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const item = runtime({ beforeClose: () => gate });
    let settled = false;
    const promise = item.sdk.download(voice).then(() => { settled = true; });
    await vi.waitFor(() => expect(item.writes).toHaveLength(2));
    expect(settled).toBe(false); expect(item.files.size).toBe(0);
    release(); await promise; expect(item.files.has(modelFile)).toBe(true); expect(item.files.has(configFile)).toBe(true);
  });
  it('waits for a late companion write before cleaning a failed cache commit', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const item = runtime({ beforeClose: async name => { if (name.endsWith('.json')) await gate; else throw new Error('Disk write failed'); } });
    const promise = item.sdk.download(voice);
    const rejected = expect(promise).rejects.toThrow('Disk write failed');
    await vi.waitFor(() => expect(item.writes).toHaveLength(2)); release(); await rejected;
    expect(item.files.size).toBe(0);
  });
  it('reuses the one synthesis session as cache validation without another load or write', async () => {
    const item = runtime({ cached: true });
    await item.sdk.TtsSession.create({ voiceId: voice });
    expect(item.create).toHaveBeenCalledOnce(); expect(item.fetch).not.toHaveBeenCalled(); expect(item.writes).toEqual([]);
  });
  it('removes a cached model that cannot create its synthesis session', async () => {
    const item = runtime({ cached: true, create: async () => { throw new Error('Invalid ONNX graph'); } });
    await expect(item.sdk.TtsSession.create({ voiceId: voice })).rejects.toThrow('Invalid ONNX graph');
    expect(item.files.has(modelFile)).toBe(false); expect(item.removals).toContain(modelFile);
  });
});
