// @ts-check
import { renderPrompt } from '../settings/prompt-catalog.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { createApiError, isApiQuotaCode } from './http-errors.js';
import { pcmToWav } from './audio-format.js';
import { OPENAI_TTS_MODEL, OPENAI_TTS_VOICES, DEFAULT_OPENAI_TTS_VOICE, OPENAI_TTS_MIN_SPEED, OPENAI_TTS_MAX_SPEED, OPENAI_TTS_MAX_INPUT } from './tts-catalog.js';
import { CONFIG } from '../utils/config.js';
import { getUILanguage, tSync } from '../locales.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';

const SAMPLE_RATE = 24000;;

/** @returns {import('../types.js').ExtendedError} */
function localizedError(key, language, params = {}) {
  return Object.assign(new Error(tSync(key, language, params)), { translationKey: key, translationParams: params });
}

function realtimeQuotaError(details, language) {
  if (!isApiQuotaCode(details?.code) && !isApiQuotaCode(details?.type)) return null;
  return Object.assign(localizedError('errorApiQuotaExceeded', language), { status: 429, retryable: false });
}

function findAudioPart(event, outputs, create) {
  const { item_id: itemId, output_index: outputIndex, content_index: contentIndex } = event;
  if (typeof itemId !== 'string' || !itemId || !Number.isSafeInteger(outputIndex) || outputIndex < 0 ||
      !Number.isSafeInteger(contentIndex) || contentIndex < 0) return null;
  let output = outputs.get(outputIndex);
  if (!output && create) {
    output = { itemId, parts: new Map() };
    outputs.set(outputIndex, output);
  }
  if (output?.itemId !== itemId) return null;
  let part = output.parts.get(contentIndex);
  if (!part && create) {
    part = { chunks: [], bytes: 0, done: false };
    output.parts.set(contentIndex, part);
  }
  return part || null;
}

/** Check observed parts and reconcile any audio descriptors in the terminal response. */
function getCompletedAudioParts(outputs, metadata) {
  const ordered = [];
  for (const [outputIndex, output] of [...outputs].sort(([a], [b]) => a - b)) {
    const item = metadata?.[outputIndex];
    if (metadata?.length && (item?.id !== output.itemId || (item.type && item.type !== 'message') ||
        (item.role && item.role !== 'assistant') || item.status === 'incomplete' || item.status === 'in_progress')) return null;
    for (const [contentIndex, part] of [...output.parts].sort(([a], [b]) => a - b)) {
      const descriptor = item?.content?.[contentIndex];
      if (!part.done || !part.bytes || part.bytes % 2 || (descriptor?.type && descriptor.type !== 'output_audio')) return null;
      ordered.push(part);
    }
  }
  if (Array.isArray(metadata)) {
    for (const [outputIndex, item] of metadata.entries()) {
      if (!Array.isArray(item?.content)) continue;
      for (const [contentIndex, descriptor] of item.content.entries()) {
        if (descriptor?.type === 'output_audio' && !outputs.get(outputIndex)?.parts.has(contentIndex)) return null;
      }
    }
  }
  return ordered.length ? ordered : null;
}

export function validateOpenAiVoice(voice = DEFAULT_OPENAI_TTS_VOICE, language = 'en') {
  if (!OPENAI_TTS_VOICES.includes(voice)) {
    throw localizedError('errorOpenaiVoiceUnavailable', language, { voice: String(voice) });
  }
  return voice;
}

/** Generate a complete, independently owned PCM/WAVE narration response. */
export async function textToSpeech(text, apiKey, options = {}) {
  const language = await getUILanguage();
  const checkCancelled = async () => {
    options.signal?.throwIfAborted();
    await checkCancellation('OpenAI speech', options.processingRunId);
    options.signal?.throwIfAborted();
  };
  await checkCancelled();
  if (typeof text !== 'string' || !text.length) throw localizedError('errorTtsNoText', language);
  if (text.length > OPENAI_TTS_MAX_INPUT) {
    throw localizedError('errorTtsTextTooLong', language, { length: text.length, max: OPENAI_TTS_MAX_INPUT });
  }
  if (!apiKey) throw localizedError('errorTtsNoApiKey', language);
  const voice = validateOpenAiVoice(options.voice, language);
  const requestedSpeed = Number(options.speed ?? 1);
  const speed = Number.isFinite(requestedSpeed) ? Math.max(OPENAI_TTS_MIN_SPEED, Math.min(OPENAI_TTS_MAX_SPEED, requestedSpeed)) : 1;
  const style = options.openaiInstructions || options.instructions;
  const narration = renderPrompt('openaiNarration', options);
  const session = {
    type: 'realtime', model: OPENAI_TTS_MODEL, output_modalities: ['audio'],
    instructions: style ? `${narration}\nVoice style: ${style}` : narration,
    audio: { input: { turn_detection: null }, output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, voice, speed } },
    tools: [], max_output_tokens: 'inf', tracing: null, truncation: 'disabled'
  };
  const deadline = Date.now() + CONFIG.API_TIMEOUT_MS;
  let response;
  try {
    response = await fetchBufferedResponse('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 60 }, session }), signal: options.signal
    }, Math.max(1, deadline - Date.now()), { checkCancelled });
  } catch (error) {
    await checkCancelled();
    if (['AbortError', 'TimeoutError'].includes(error.name)) {
      throw Object.assign(localizedError('errorTtsTimeout', language), { name: error.name, retryable: false });
    }
    throw Object.assign(localizedError('errorTtsConnectionFailed', language), { status: 503 });
  }
  await checkCancelled();
  if (!response.ok) {
    const error = await createApiError(response, 'openai');
    await checkCancelled();
    if (error.translationKey === 'errorApiQuotaExceeded') {
      throw Object.assign(localizedError(error.translationKey, language), { status: error.status, retryable: false });
    }
    throw Object.assign(localizedError('errorTtsApiError', language, { status: error.status }), {
      status: error.status, response: error.response
    });
  }
  let credentials;
  try { credentials = await response.json(); } catch { throw localizedError('errorTtsInvalidAudio', language); }
  if (typeof credentials.value !== 'string' || !/^ek_[A-Za-z0-9_-]+$/.test(credentials.value)) {
    throw localizedError('errorTtsInvalidAudio', language);
  }
  await checkCancelled();
  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    let started = false;
    let responseId;
    let totalBytes = 0;
    const outputs = new Map();
    let cancellationPending = false;
    let timeout;
    let cancellation;
    const aborted = () => finish(options.signal.reason instanceof Error ? options.signal.reason : new DOMException('Request cancelled', 'AbortError'));
    const finish = (error, audio) => {
      if (settled) return;
      settled = true;
      if (error && started && !options.signal?.aborted) error.retryable = false;
      clearTimeout(timeout);
      clearInterval(cancellation);
      options.signal?.removeEventListener('abort', aborted);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try { socket.close(); } catch { /* The connection may already be closed. */ }
      }
      outputs.clear();
      error ? reject(error) : resolve(audio);
    };
    const fail = key => {
      const error = localizedError(key, language);
      if (key === 'errorTtsConnectionFailed' && !started) error.status = 503;
      finish(error);
    };
    const checkOwner = async () => {
      if (settled || cancellationPending) return;
      cancellationPending = true;
      try { await checkCancelled(); } catch (error) { finish(error); }
      finally { cancellationPending = false; }
    };
    timeout = setTimeout(() => finish(Object.assign(localizedError('errorTtsTimeout', language), { name: 'AbortError' })), Math.max(1, deadline - Date.now()));
    cancellation = setInterval(checkOwner, 250);
    options.signal?.addEventListener('abort', aborted, { once: true });
    if (options.signal?.aborted) { aborted(); return; }
    try {
      socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${OPENAI_TTS_MODEL}`, ['realtime', `openai-insecure-api-key.${credentials.value}`]);
      socket.onerror = () => fail('errorTtsConnectionFailed');
      socket.onclose = () => fail('errorTtsIncomplete');
      socket.onmessage = async event => {
        try {
          await checkCancelled();
          if (settled) return;
          const data = JSON.parse(event.data);
          if (data.type === 'session.created' && !started) {
            const output = data.session?.audio?.output;
            if (output?.format?.type !== 'audio/pcm' || output.format.rate !== SAMPLE_RATE || output.voice !== voice || (output.speed ?? 1) !== speed) {
              fail('errorTtsInvalidAudio');
              return;
            }
            started = true;
            socket.send(JSON.stringify({ type: 'response.create', response: {
              conversation: 'none', output_modalities: ['audio'],
              input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }]
            } }));
          } else if (data.type === 'response.created' && started && !responseId) {
            responseId = data.response?.id;
            if (typeof responseId !== 'string' || !responseId) fail('errorTtsInvalidAudio');
          } else if (data.type === 'response.output_audio.delta') {
            const part = responseId && data.response_id === responseId ? findAudioPart(data, outputs, true) : null;
            if (!part || part.done || typeof data.delta !== 'string') {
              fail('errorTtsInvalidAudio');
              return;
            }
            const decoded = atob(data.delta);
            if (!decoded.length || totalBytes + decoded.length > 0xffffffff - 36) {
              fail('errorTtsInvalidAudio');
              return;
            }
            const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
            part.chunks.push(bytes);
            part.bytes += bytes.byteLength;
            totalBytes += bytes.byteLength;
          } else if (data.type === 'response.output_audio.done') {
            const part = responseId && data.response_id === responseId ? findAudioPart(data, outputs, false) : null;
            if (!part || part.done) { fail('errorTtsInvalidAudio'); return; }
            part.done = true;
          } else if (data.type === 'response.done') {
            const response = data.response;
            const ownsResponse = responseId && response?.id === responseId;
            const quota = ownsResponse && response.status === 'failed'
              ? realtimeQuotaError(response.status_details?.error, language) : null;
            if (quota) { finish(quota); return; }
            const parts = ownsResponse && response.status === 'completed'
              ? getCompletedAudioParts(outputs, response.output) : null;
            if (!parts) {
              fail('errorTtsIncomplete');
              return;
            }
            const pcm = new Uint8Array(totalBytes);
            let offset = 0;
            for (const part of parts) {
              for (const chunk of part.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
            }
            finish(null, pcmToWav(pcm.buffer, SAMPLE_RATE));
          } else if (data.type === 'error') {
            const quota = realtimeQuotaError(data.error, language);
            if (quota) { finish(quota); return; }
            const code = data.error?.code;
            const status = code === 'rate_limit_exceeded' ? 429 : code === 'server_error' ? 500 : 400;
            finish(Object.assign(localizedError('errorTtsApiError', language, { status }), { status }));
          }
        } catch (error) {
          try { await checkCancelled(); } catch (cancelled) { finish(cancelled); return; }
          fail('errorTtsInvalidAudio');
        }
      };
    } catch {
      fail('errorTtsConnectionFailed');
    }
  });
}
