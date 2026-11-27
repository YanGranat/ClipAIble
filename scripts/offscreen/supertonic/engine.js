// @ts-check

// Supertonic inference is adapted from MIT-licensed code, Copyright (c) 2025 Supertone Inc.
// See THIRD_PARTY_NOTICES.txt.

import { pcmToWav } from '../../api/audio-format.js';
import { splitNarrationText } from '../../utils/narration-chunks.js';

/** @typedef {typeof import('onnxruntime-web')} Runtime */
/** @typedef {import('onnxruntime-web').InferenceSession} Session */
/** @typedef {() => (void | Promise<void>)} CheckCancelled */
/** @typedef {{get: (name: string) => Promise<ArrayBuffer>}} Assets */

const MODELS = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'];
const LANGUAGES = new Set('en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi na'.split(' '));
const VOICE_PATTERN = /^[FM][1-5]$/;
const STEPS = 8;
const PAUSE_SECONDS = 0.3;
const MAX_SEGMENT_SECONDS = 180;
const DECODER = new TextDecoder();

const REPLACEMENTS = {
  '–': '-', '‑': '-', '—': '-', '_': ' ', '“': '"', '”': '"', '‘': "'", '’': "'",
  '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' '
};

function languageTag(value) {
  const base = String(value || '').toLowerCase().split(/[-_]/, 1)[0];
  if (base === 'ua') return 'uk';
  return LANGUAGES.has(base) ? base : 'na';
}

function spokenText(text, language) {
  let normalized = text.normalize('NFKD')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0e\ufe0f♥☆♡©\\]/gu, '');
  for (const [from, to] of Object.entries(REPLACEMENTS)) normalized = normalized.replaceAll(from, to);
  if (language === 'en') {
    normalized = normalized.replaceAll('@', ' at ').replaceAll('e.g.,', 'for example, ').replaceAll('i.e.,', 'that is, ');
  }
  normalized = normalized.replace(/\s+([,.!?;:'])/g, '$1').replace(/("|')\1+/g, '$1').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (!/[.!?;:,'"')\]}…。！？」』】〉》›»]$/u.test(normalized)) normalized += '.';
  return `<${language}>${normalized}</${language}>`;
}

async function readJson(assets, name) {
  const bytes = await assets.get(name);
  return JSON.parse(DECODER.decode(bytes));
}

function floatTensor(ort, data, dims) {
  return new ort.Tensor('float32', data, dims);
}

/** Let the worker receive cancellation messages between synchronous WebAssembly runs. */
async function yieldForCancellation(check) {
  if (!check) return;
  await new Promise(resolve => setTimeout(resolve, 0));
  await check();
}

function readStyleTensor(ort, entry, expected) {
  if (!Array.isArray(entry?.dims) || entry.dims.length !== expected.length ||
      entry.dims.some((size, index) => size !== expected[index]) || !Array.isArray(entry.data)) {
    throw new Error('Invalid Supertonic voice style');
  }
  const values = entry.data.flat(Infinity);
  if (values.length !== expected.reduce((size, dim) => size * dim, 1) || !values.every(Number.isFinite)) {
    throw new Error('Invalid Supertonic voice style values');
  }
  return floatTensor(ort, Float32Array.from(values), expected);
}

async function readStyle(ort, assets, voice) {
  const style = await readJson(assets, `voice_styles/${voice}.json`);
  const ttl = readStyleTensor(ort, style.style_ttl, [1, 50, 256]);
  try {
    const dp = readStyleTensor(ort, style.style_dp, [1, 8, 16]);
    return { ttl, dp };
  } catch (error) {
    ttl.dispose();
    throw error;
  }
}

function normalNoise(length) {
  const latent = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const radius = Math.sqrt(-2 * Math.log(Math.max(0.0001, Math.random())));
    const angle = 2 * Math.PI * Math.random();
    latent[i] = radius * Math.cos(angle);
    if (i + 1 < length) latent[i + 1] = radius * Math.sin(angle);
  }
  return latent;
}

function makeAudio(parts, sampleRate) {
  const pause = Math.floor(sampleRate * PAUSE_SECONDS);
  const count = parts.reduce((size, part) => size + part.length, 0) + pause * (parts.length - 1);
  const pcm = new ArrayBuffer(count * 2);
  const output = new DataView(pcm);
  let offset = 0;
  for (const part of parts) {
    for (const sample of part) {
      if (!Number.isFinite(sample)) throw new Error('Supertonic generated an invalid waveform');
      output.setInt16(offset * 2, Math.round(Math.min(1, Math.max(-1, sample)) * (sample < 0 ? 32768 : 32767)), true);
      offset++;
    }
    offset += pause;
  }
  return pcmToWav(pcm, sampleRate);
}

/** Run the pinned Supertonic 3 pipeline with the local ONNX WebAssembly runtime. */
export async function createSupertonicEngine(
  /** @type {Runtime} */ ort,
  /** @type {Assets} */ assets,
  /** @type {{checkCancelled?: CheckCancelled}} */ { checkCancelled } = {}
) {
  await checkCancelled?.();
  const settings = await readJson(assets, 'onnx/tts.json');
  const sampleRate = settings?.ae?.sample_rate;
  const chunkSize = settings?.ae?.base_chunk_size * settings?.ttl?.chunk_compress_factor;
  const channels = settings?.ttl?.latent_dim * settings?.ttl?.chunk_compress_factor;
  if (sampleRate !== 44100 || chunkSize !== 3072 || channels !== 144) throw new Error('Invalid Supertonic model configuration');
  const indexer = await readJson(assets, 'onnx/unicode_indexer.json');
  if (!Array.isArray(indexer) || indexer.length !== 65536 || !indexer.every(Number.isInteger)) {
    throw new Error('Invalid Supertonic text vocabulary');
  }

  /** @type {Session[]} */ const sessions = [];
  const closeSessions = async () => { await Promise.allSettled(sessions.map(async session => session.release())); };
  try {
    for (const name of MODELS) {
      await checkCancelled?.();
      const model = await assets.get(`onnx/${name}.onnx`);
      await checkCancelled?.();
      sessions.push(await ort.InferenceSession.create(new Uint8Array(model), {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all'
      }));
    }
    await checkCancelled?.();
  } catch (error) {
    await closeSessions();
    throw error;
  }
  const [predictor, encoder, estimator, vocoder] = sessions;

  async function infer(text, style, speed, check) {
    const ids = BigInt64Array.from([...text].map(character => BigInt(indexer[character.codePointAt(0)] ?? -1)));
    /** @type {import('onnxruntime-web').Tensor[]} */ const tensors = [];
    const make = (data, dims) => {
      const tensor = floatTensor(ort, data, dims);
      tensors.push(tensor);
      return tensor;
    };
    const textIds = new ort.Tensor('int64', ids, [1, ids.length]);
    tensors.push(textIds);
    const textMask = make(new Float32Array(ids.length).fill(1), [1, 1, ids.length]);

    try {
      await check?.();
      const { duration } = await predictor.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
      tensors.push(duration);
      const seconds = Number(duration.data[0]) / speed;
      if (!(seconds > 0 && seconds <= MAX_SEGMENT_SECONDS)) throw new Error('Invalid Supertonic speech duration');
      const samples = Math.max(1, Math.floor(seconds * sampleRate));
      const latentLength = Math.ceil(samples / chunkSize);
      const dims = [1, channels, latentLength];
      const latentMask = make(new Float32Array(latentLength).fill(1), [1, 1, latentLength]);
      const totalSteps = make(Float32Array.of(STEPS), [1]);

      await check?.();
      const { text_emb: embedding } = await encoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
      tensors.push(embedding);
      let latent = floatTensor(ort, normalNoise(channels * latentLength), dims);
      try {
        for (let step = 0; step < STEPS; step++) {
          await yieldForCancellation(check);
          const currentStep = floatTensor(ort, Float32Array.of(step), [1]);
          try {
            const { denoised_latent: denoised } = await estimator.run({ noisy_latent: latent, text_emb: embedding,
              style_ttl: style.ttl, latent_mask: latentMask, text_mask: textMask, current_step: currentStep, total_step: totalSteps });
            latent.dispose();
            latent = denoised;
          } finally {
            currentStep.dispose();
          }
        }
        await check?.();
        const { wav_tts: waveform } = await vocoder.run({ latent });
        try {
          await check?.();
          if (!(waveform.data instanceof Float32Array) || waveform.data.length < samples) throw new Error('Incomplete Supertonic waveform');
          return waveform.data.slice(0, samples);
        } finally {
          waveform.dispose();
        }
      } finally {
        latent.dispose();
      }
    } finally {
      for (const tensor of tensors) tensor.dispose();
    }
  }

  let queue = Promise.resolve();
  /** @type {Promise<void> | undefined} */ let released;
  return {
    synthesize(text, /** @type {{lang?: string, voice?: string, speed?: number, checkCancelled?: CheckCancelled}} */
      { lang, voice = 'F1', speed = 1, checkCancelled: check } = {}) {
      if (released) return Promise.reject(new Error('Supertonic engine is closed'));
      const result = queue.then(async () => {
        await check?.();
        if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new RangeError('Invalid Supertonic speed');
        if (!VOICE_PATTERN.test(voice)) throw new Error('Invalid Supertonic voice');
        const language = languageTag(lang);
        const limit = language === 'ja' || language === 'ko' ? 120 : 300;
        const chunks = typeof text === 'string' ? text.trim().split(/\n\s*\n+/)
          .flatMap(paragraph => splitNarrationText(paragraph, limit)).map(part => spokenText(part, language)).filter(Boolean) : [];
        if (!chunks.length) throw Object.assign(new Error('No text provided for Supertonic'), { translationKey: 'errorTtsNoText' });
        const style = await readStyle(ort, assets, voice);
        const parts = [];
        try {
          for (const chunk of chunks) parts.push(await infer(chunk, style, speed, check));
          await check?.();
          return makeAudio(parts, sampleRate);
        } finally {
          style.ttl.dispose();
          style.dp.dispose();
        }
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    release() {
      return released ??= queue.then(closeSessions);
    }
  };
}
