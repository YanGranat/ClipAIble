import { describe, expect, it, vi } from 'vitest';
import { createSupertonicEngine } from '../../scripts/offscreen/supertonic/engine.js';
import { readWav } from '../../scripts/utils/wav.js';

const json = value => new TextEncoder().encode(JSON.stringify(value)).buffer;

function fixture() {
  class Tensor {
    dispose = vi.fn();
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
  }
  const tensors = [];
  const createTensor = (type, data, dims) => {
    const tensor = new Tensor(type, data, dims);
    tensors.push(tensor);
    return tensor;
  };
  const predictor = vi.fn(async () => ({ duration: createTensor('float32', Float32Array.of(0.125), [1]) }));
  const encoder = vi.fn(async () => ({ text_emb: createTensor('float32', Float32Array.of(0), [1, 1, 1]) }));
  const estimator = vi.fn(async ({ noisy_latent }) => ({ denoised_latent: createTensor('float32', noisy_latent.data, noisy_latent.dims) }));
  const vocoder = vi.fn(async ({ latent }) => {
    const length = latent.dims[2] * 3072;
    return { wav_tts: createTensor('float32', new Float32Array(length).fill(0.5), [1, length]) };
  });
  const ordered = [predictor, encoder, estimator, vocoder];
  const sessions = [];
  const create = vi.fn(async (_model, options) => {
    expect(options.executionProviders).toEqual(['wasm']);
    const session = { run: ordered[sessions.length], release: vi.fn(async () => {}) };
    sessions.push(session);
    return session;
  });
  const config = { ae: { sample_rate: 44100, base_chunk_size: 512 }, ttl: { chunk_compress_factor: 6, latent_dim: 24 } };
  const style = { style_ttl: { dims: [1, 50, 256], data: new Array(50 * 256).fill(0) }, style_dp: { dims: [1, 8, 16], data: new Array(8 * 16).fill(0) } };
  const get = vi.fn(async name => {
    if (name === 'onnx/tts.json') return json(config);
    if (name === 'onnx/unicode_indexer.json') return json(Array.from({ length: 65536 }, (_, index) => index));
    if (name === 'voice_styles/F1.json') return json(style);
    if (name.startsWith('onnx/') && name.endsWith('.onnx')) return new ArrayBuffer(8);
    throw new Error('Unexpected asset');
  });
  return { ort: { InferenceSession: { create }, Tensor }, assets: { get }, sessions, tensors, predictor, encoder, estimator, vocoder };
}

describe('Supertonic local inference', () => {
  it('feeds the Ukrainian language tag and F1 style into the four pinned graphs', async () => {
    const f = fixture();
    const engine = await createSupertonicEngine(f.ort, f.assets);
    try {
      const audio = readWav(await engine.synthesize('Зразок 2,5.\n\nДругий абзац.', { lang: 'ua-UA', speed: 2 }));
      const decode = ids => String.fromCodePoint(...Array.from(ids, Number));
      expect(f.predictor.mock.calls.map(([{ text_ids }]) => decode(text_ids.data))).toEqual(['<uk>Зразок 2,5.</uk>', '<uk>Другий абзац.</uk>']);
      expect(f.assets.get.mock.calls.map(([name]) => name)).toEqual([
        'onnx/tts.json', 'onnx/unicode_indexer.json', 'onnx/duration_predictor.onnx', 'onnx/text_encoder.onnx',
        'onnx/vector_estimator.onnx', 'onnx/vocoder.onnx', 'voice_styles/F1.json'
      ]);
      expect(f.estimator).toHaveBeenCalledTimes(16);
      expect(f.estimator.mock.calls.map(([call]) => call.current_step.data[0])).toEqual([...Array(16).keys()].map(step => step % 8));
      expect(audio.format).toMatchObject({ encoding: 1, channels: 1, sampleRate: 44100, bits: 16 });
      const samplesPerPart = Math.floor(0.125 / 2 * 44100);
      const silence = Math.floor(0.3 * 44100);
      expect(audio.data.length).toBe((2 * samplesPerPart + silence) * 2);
      const pcm = new DataView(audio.data.buffer, audio.data.byteOffset, audio.data.byteLength);
      expect(pcm.getInt16(0, true)).toBe(16384);
      expect(pcm.getInt16(2 * samplesPerPart, true)).toBe(0);
      expect(pcm.getInt16(2 * (samplesPerPart + silence), true)).toBe(16384);
      expect(f.tensors.every(tensor => tensor.dispose.mock.calls.length === 1)).toBe(true);
    } finally {
      await engine.release();
    }
    expect(f.sessions.every(session => session.release.mock.calls.length === 1)).toBe(true);
    await engine.release();
    await expect(engine.synthesize('Closed.')).rejects.toThrow('closed');
    expect(f.sessions.every(session => session.release.mock.calls.length === 1)).toBe(true);
  });

  it('releases already opened graphs when initialization fails', async () => {
    const f = fixture();
    const original = f.assets.get.getMockImplementation();
    f.assets.get.mockImplementation(name => name === 'onnx/vector_estimator.onnx' ? Promise.reject(new Error('Missing model')) : original(name));
    await expect(createSupertonicEngine(f.ort, f.assets)).rejects.toThrow('Missing model');
    expect(f.sessions).toHaveLength(2);
    expect(f.sessions.every(session => session.release.mock.calls.length === 1)).toBe(true);
  });

  it('stops a cancelled request between inference runs and can synthesize again', async () => {
    const f = fixture();
    const engine = await createSupertonicEngine(f.ort, f.assets);
    const cancelled = new DOMException('Cancelled', 'AbortError');
    try {
      await expect(engine.synthesize('Read this.', { checkCancelled() { if (f.estimator.mock.calls.length) throw cancelled; } })).rejects.toBe(cancelled);
      expect(f.estimator).toHaveBeenCalledOnce();
      expect(f.vocoder).not.toHaveBeenCalled();
      expect(f.tensors.every(tensor => tensor.dispose.mock.calls.length === 1)).toBe(true);
      expect(readWav(await engine.synthesize('Read this.')).data.length).toBeGreaterThan(0);
    } finally {
      await engine.release();
    }
  });

  it('gives a queued worker cancellation a turn between synchronous estimator runs', async () => {
    const f = fixture();
    const engine = await createSupertonicEngine(f.ort, f.assets);
    const cancelled = new DOMException('Cancelled', 'AbortError');
    const estimate = f.estimator.getMockImplementation();
    let requested = false;
    f.estimator.mockImplementationOnce(args => {
      setTimeout(() => { requested = true; }, 0);
      return estimate(args);
    });
    try {
      await expect(engine.synthesize('Read this.', { checkCancelled() { if (requested) throw cancelled; } })).rejects.toBe(cancelled);
      expect(f.estimator).toHaveBeenCalledOnce();
      expect(f.vocoder).not.toHaveBeenCalled();
    } finally {
      await engine.release();
    }
  });
});
