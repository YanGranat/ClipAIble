// @ts-check
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { createApiError } from './http-errors.js';
import { getOpenRouterTtsModel, resolveOpenRouterTtsSelection } from './tts-catalog.js';
import { buildOpenRouterSpeechFields } from './openrouter-speech-options.js';
import { pcmToWav } from './audio-format.js';
import { readWav } from '../utils/wav.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { markProcessingRequestStarted } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';

const API_URL = 'https://openrouter.ai/api/v1/audio/speech';

/** Russian MAI voices can drop a leading minus sign before a number. */
export function normalizeOpenRouterSpeechInput(text, model, voice) {
  if (model !== 'microsoft/mai-voice-2.1' || !voice.startsWith('ru-RU-')) return text;
  return text.replace(/(^|[\s(\[«])[-−](?=\d)/gu, '$1минус\u00a0');
}

function wrapOpenRouterPcm(audio, contentType) {
  const [mime, ...parameters] = (contentType ?? '').toLowerCase().split(';').map(part => part.trim());
  const format = new Map(parameters.map(part => {
    const [name, value] = part.split('=').map(value => value.trim());
    return [name, value];
  }));
  // The speech API's normalized PCM stream is signed 16-bit, 24 kHz and mono.
  if (mime !== 'audio/pcm' || format.get('rate') !== '24000' || format.get('channels') !== '1') {
    throw new Error('Unexpected PCM format');
  }
  return pcmToWav(audio, 24000);
}

/**
 * Synthesize a single narration segment as a validated WAV container.
 * @param {string} text
 * @param {string} apiKey
 * @param {Partial<import('../types.js').TTSOptions>} [options]
 * @returns {Promise<ArrayBuffer>}
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const check = () => checkCancellation('OpenRouter speech', options.processingRunId);
  options.signal?.throwIfAborted();
  await check();
  const uiLang = await getUILanguage();
  const invalid = (translationKey, translationParams = {}) => Object.assign(
    new Error(tSync(translationKey, uiLang, translationParams)),
    { translationKey, translationParams, retryable: false }
  );
  if (typeof text !== 'string' || !text.trim()) throw invalid('errorTtsNoText');
  if (!apiKey) throw invalid('errorTtsNoApiKey');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /^(?:\*{4}|•{4}|ENC:)/.test(apiKey)) {
    throw invalid('errorApiKeyInvalid');
  }
  const { model, voice } = resolveOpenRouterTtsSelection(options.openrouterTtsModel, options.openrouterTtsVoice);
  const { maxInput, responseFormat } = getOpenRouterTtsModel(model);
  const input = normalizeOpenRouterSpeechInput(text, model, voice);
  if (input.length > maxInput) throw invalid('errorTtsTextTooLong', { length: input.length, max: maxInput });
  const body = JSON.stringify({
    model, input, voice, response_format: responseFormat,
    ...buildOpenRouterSpeechFields(model, voice, options.openrouterTtsOptions)
  });

  try {
    return await callWithRetry(async ({ signal }) => {
      await check();
      const response = await fetchBufferedResponse(API_URL, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json', Accept: `audio/${responseFormat}` },
        body
      }, CONFIG.API_TIMEOUT_MS, { checkCancelled: check,
        onRequestStart: () => markProcessingRequestStarted(options.processingRunId) });
      if (!response.ok) throw await createApiError(response, 'OpenRouter');
      const audio = await response.arrayBuffer();
      await check();
      options.signal?.throwIfAborted();
      try {
        const wav = responseFormat === 'pcm' ? wrapOpenRouterPcm(audio, response.headers.get('content-type')) : audio;
        readWav(wav);
        return wav;
      } catch {
        throw invalid('errorTtsInvalidAudio');
      }
    }, { signal: options.signal, checkCancelled: check });
  } catch (error) {
    options.signal?.throwIfAborted();
    await check();
    if (error.translationKey || ['AbortError', 'TimeoutError'].includes(error.name)) throw error;
    throw invalid('errorNetwork');
  }
}
