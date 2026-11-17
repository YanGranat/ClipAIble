import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { patchPiperTtsSource } from '../../build-piper.js';

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
    const create = vi.fn(async () => ({ run: async () => ({ output: { data: new Float32Array([0, 0.5, -0.5]) } }) }));
    const locations = [];
    const runtime = { env: { wasm: {} }, InferenceSession: { create }, Tensor: class {} };
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
  });

  it('fails the build when the supported SDK resource contract changes', async () => {
    const source = await readFile(sdkPath, 'utf8');
    expect(() => patchPiperTtsSource(source.replace('const DEFAULT_WASM_PATHS', 'const OTHER_PATHS'), sdkPath)).toThrow('Unsupported Piper SDK');
    expect(() => patchPiperTtsSource(source.replace('await modelBlob.arrayBuffer()', 'await otherModel.arrayBuffer()'), sdkPath)).toThrow('WASM execution provider');
  });
});
