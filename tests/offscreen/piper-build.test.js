import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { patchPiperTtsSource, patchPiperPhonemizerSource } from '../../build-piper.js';

const sdkPath = createRequire(import.meta.url).resolve.paths('@mintplex-labs/piper-tts-web')
  .map(base => join(base, '@mintplex-labs/piper-tts-web/dist/piper-tts-web.js')).find(existsSync);

describe('packaged Piper SDK build adapter', () => {
  it('configures the actual installed SDK to resolve local WASM resources and a single WASM provider', async () => {
    const bundle = await build({ entryPoints: [sdkPath], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Piper', plugins: [{
      name: 'browser-boundaries', setup(builder) {
        builder.onLoad({ filter: /piper-o91UDS6e\.js$/ }, () => ({ contents: 'export const createPiperPhonemize = options => self.phonemize(options);', loader: 'js' }));
        builder.onLoad({ filter: /piper-tts-web.*\.js$/ }, async args => ({ contents: patchPiperTtsSource(await readFile(args.path, 'utf8'), args.path), loader: 'js' }));
      }
    }] });
    const config = { espeak: { voice: 'en-us' }, audio: { sample_rate: 22050 }, inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, speaker_id_map: {} };
    const feeds = [];
    const create = vi.fn(async () => ({ run: async value => { feeds.push(value); return { output: { data: new Float32Array([0, 0.5, -0.5]) } }; } }));
    const locations = [];
    const runtime = { env: { wasm: {} }, InferenceSession: { create }, Tensor: class { constructor(type, data) { this.data = data; } } };
    const context = {
      Blob, ArrayBuffer, DataView, Float32Array, Uint8Array, console,
      navigator: { hardwareConcurrency: 8, storage: { getDirectory: async () => ({ getDirectoryHandle: async () => ({
        getFileHandle: async filename => ({ getFile: async () => new Blob([filename.endsWith('.json') ? JSON.stringify(config) : new Uint8Array([1, 2, 3])]) })
      }) }) } },
      self: { location: { origin: 'chrome-extension://test-extension-id' }, ort: runtime, phonemize: options => {
        locations.push(options.locateFile('piper_phonemize.data'), options.locateFile('piper_phonemize.wasm'));
        return { callMain: () => options.print(JSON.stringify({ phoneme_ids: [1, 2] })) };
      } }
    };
    runInNewContext(bundle.outputFiles[0].text, context);
    expect(locations).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    const session = await context.Piper.TtsSession.create({ voiceId: 'en_US-hfc_female-medium' });
    const audio = await session.predict('Sample text.');
    expect(runtime.env.wasm.numThreads).toBe(1);
    expect(runtime.env.wasm.wasmPaths).toBe('chrome-extension://test-extension-id/lib/');
    expect(create.mock.calls[0][1].executionProviders).toEqual(['wasm']);
    expect(locations).toEqual([
      'chrome-extension://test-extension-id/lib/piper-wasm/piper_phonemize.data',
      'chrome-extension://test-extension-id/lib/piper-wasm/piper_phonemize.wasm'
    ]);
    expect(audio.size).toBeGreaterThan(44);
    await session.predict('Sample text.', 2);
    await context.Piper.predict({ text: 'Sample text.', voiceId: 'en_US-hfc_female-medium', speed: 1.25 });
    expect(feeds.map(value => value.scales.data[1])).toEqual([1, 0.5, 0.8]);
    expect(config.inference.length_scale).toBe(1);
    await expect(session.predict('Sample text.', 0)).rejects.toThrow('Invalid speech speed');
  });

  it('fails the build when the supported SDK resource contract changes', async () => {
    const source = await readFile(sdkPath, 'utf8');
    expect(() => patchPiperTtsSource(source.replace('const DEFAULT_WASM_PATHS', 'const OTHER_PATHS'), sdkPath)).toThrow('Unsupported Piper SDK');
    expect(() => patchPiperTtsSource(source.replace('await modelBlob.arrayBuffer()', 'await otherModel.arrayBuffer()'), sdkPath)).toThrow('WASM execution provider');
    expect(() => patchPiperTtsSource(source.replace('piper-o91UDS6e.js', 'other-factory.js'), sdkPath)).toThrow('phonemizer factory import');
  });

  it('adapts the packaged phonemizer without retaining a CommonJS or AMD export', async () => {
    const source = await readFile(new URL('../../lib/piper-wasm/piper_phonemize.js', import.meta.url), 'utf8');
    const adapted = patchPiperPhonemizerSource(source);
    expect(adapted).toContain('export { createPiperPhonemize };');
    expect(adapted).not.toMatch(/module\.exports|define\(\[\],/);
    expect(adapted).not.toMatch(/require\(["'](?:fs|path)["']\)/);
    expect(() => patchPiperPhonemizerSource(source.replace('module.exports = createPiperPhonemize;', 'module.exports = otherFactory;'))).toThrow('Unsupported Piper phonemizer');
  });
});
