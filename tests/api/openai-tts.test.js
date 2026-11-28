import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textToSpeech } from '../../scripts/api/openai-tts.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { callWithRetry } from '../../scripts/utils/retry.js';
import { realtimeWebSocket } from '../helpers/realtime-websocket.js';

const owner = vi.hoisted(() => ({ cancelled: false }));
const requestTimeout = CONFIG.API_TIMEOUT_MS;
const outputItem = (id, count = 1) => ({ id, type: 'message', role: 'assistant', status: 'completed',
  content: Array.from({ length: count }, () => ({ type: 'output_audio' })) });
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ checkCancellation: async () => { if (owner.cancelled) throw new Error('Cancelled'); } }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));

beforeEach(() => {
  owner.cancelled = false;
  CONFIG.API_TIMEOUT_MS = 2000;
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: 'ek_synthetic' }))));
  vi.stubGlobal('WebSocket', realtimeWebSocket(socket => socket.complete()));
});
afterEach(() => { CONFIG.API_TIMEOUT_MS = requestTimeout; vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('OpenAI Realtime narration', () => {
  it('uses an ephemeral WebSocket credential, isolated text input and accurate PCM/WAVE output', async () => {
    const result = await textToSpeech('A short article.', 'synthetic-key', { processingRunId: 'sample-run', instructions: 'Speak clearly.' });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(request.headers.Authorization).toBe('Bearer synthetic-key');
    expect(JSON.parse(request.body)).toMatchObject({ expires_after: { seconds: 60 }, session: {
      model: 'gpt-realtime-2.1-mini', output_modalities: ['audio'], tools: [], tracing: null, truncation: 'disabled',
      audio: { input: { turn_detection: null }, output: { voice: 'marin', speed: 1, format: { type: 'audio/pcm', rate: 24000 } } }
    } });
    expect(JSON.parse(request.body).session.instructions).toContain('Speak clearly.');
    const socket = WebSocket.instances[0];
    expect(socket.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
    expect(socket.protocols).toEqual(['realtime', 'openai-insecure-api-key.ek_synthetic']);
    expect(socket.sent).toEqual([{ type: 'response.create', response: { conversation: 'none', output_modalities: ['audio'],
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'A short article.' }] }] } }]);
    expect(new TextDecoder().decode(new Uint8Array(result).subarray(0, 4))).toBe('RIFF');
    const header = new DataView(result);
    expect(header.getUint32(24, true)).toBe(24000);
    expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint16(34, true)).toBe(16);
    expect(header.getUint32(40, true)).toBe(4);
    expect([...new Uint8Array(result).subarray(44)]).toEqual([1, 0, 2, 0]);
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['nova', 'fable', 'onyx', 'unknown'])('rejects unavailable voice %s before any request', async voice => {
    await expect(textToSpeech('Article.', 'synthetic-key', { voice })).rejects.toMatchObject({ translationKey: 'errorOpenaiVoiceUnavailable', translationParams: { voice } });
    expect(fetch).not.toHaveBeenCalled();
    expect(WebSocket.instances).toHaveLength(0);
  });

  it.each([0, 4, NaN])('bounds speech speed %s to the supported API range', async speed => {
    const expected = Number.isNaN(speed) ? 1 : speed === 0 ? 0.25 : 1.5;
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => socket.complete(), { speed: expected }));
    await textToSpeech('Article.', 'synthetic-key', { speed });
    expect(JSON.parse(fetch.mock.calls[0][1].body).session.audio.output.speed).toBe(expected);
  });

  it.each(['failed', 'incomplete', 'cancelled'])('rejects terminal %s status even after audio arrives', async status => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      socket.audio('delta', 'r', { delta: 'AQA=' });
      socket.audio('done', 'r');
      socket.emit({ type: 'response.done', response: { id: 'r', status } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorTtsIncomplete' });
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { code: 'organization_spend_limit_exceeded' },
    { type: 'insufficient_quota' }
  ])('reports a Realtime billing limit as non-retryable quota exhaustion', async details => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'error', error: { ...details, message: 'Opaque provider details' } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toMatchObject({
      status: 429, translationKey: 'errorApiQuotaExceeded', retryable: false
    });
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['owned failed response', 'r', 'failed', 'errorApiQuotaExceeded'],
    ['foreign failed response', 'other', 'failed', 'errorTtsIncomplete'],
    ['incomplete response', 'r', 'incomplete', 'errorTtsIncomplete'],
    ['cancelled response', 'r', 'cancelled', 'errorTtsIncomplete']
  ])('protects provider text for %s and preserves the response status', async (_case, id, status, key) => {
    const providerMessage = 'A private narration passage returned in the provider message';
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      socket.audio('delta', 'r', { delta: 'AQA=' });
      socket.audio('done', 'r');
      socket.emit({ type: 'response.done', response: { id, status, status_details: {
        type: status, error: { code: 'organization_spend_limit_exceeded', message: providerMessage }
      } } });
    }));
    const error = await textToSpeech('Article.', 'synthetic-key').catch(failure => failure);
    expect(error).toMatchObject({ translationKey: key, retryable: false });
    if (key === 'errorApiQuotaExceeded') expect(error.status).toBe(429);
    expect(error.stack).not.toContain(providerMessage);
    expect(JSON.stringify(error)).not.toContain(providerMessage);
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['foreign', 'missing-audio-end', 'empty', 'odd', 'invalid-base64', 'malformed-json', 'close'])('rejects %s audio without exporting partial data', async fault => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      if (fault === 'malformed-json') { socket.emit('{'); return; }
      if (fault === 'close') { socket.onclose(); return; }
      if (fault !== 'empty') socket.audio('delta', fault === 'foreign' ? 'other' : 'r', {
        delta: fault === 'invalid-base64' ? '%' : fault === 'odd' ? 'AQ==' : 'AQA=' });
      if (fault !== 'missing-audio-end') socket.audio('done', 'r');
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed' } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toBeInstanceOf(Error);
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('joins PCM samples split across WebSocket messages', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      for (const delta of ['AQ==', 'AA==']) socket.audio('delta', 'r', { delta });
      socket.audio('done', 'r');
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed' } });
    }));
    const result = await textToSpeech('Article.', 'synthetic-key');
    expect([...new Uint8Array(result).subarray(44)]).toEqual([1, 0]);
  });

  it('assembles complete audio parts by output and content order', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      const first = { item_id: 'first', output_index: 0, content_index: 0 };
      const second = { ...first, content_index: 1 };
      const third = { item_id: 'third', output_index: 1, content_index: 0 };
      socket.audio('delta', 'r', { ...first, delta: 'AQA=' });
      socket.audio('done', 'r', first);
      socket.audio('delta', 'r', { ...third, delta: 'AwA=' });
      socket.audio('delta', 'r', { ...second, delta: 'AgA=' });
      socket.audio('done', 'r', third);
      socket.audio('done', 'r', second);
      socket.emit({ type: 'response.done', response: {
        id: 'r', status: 'completed', output: [outputItem('first', 2), outputItem('third')]
      } });
    }));
    const result = await textToSpeech('Article.', 'synthetic-key');
    expect([...new Uint8Array(result).subarray(44)]).toEqual([1, 0, 2, 0, 3, 0]);
  });

  it.each(['incomplete second part', 'missing declared part', 'foreign final item'])('rejects %s even when the response reports completion', async fault => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      socket.audio('delta', 'r', { delta: 'AQA=' });
      if (fault === 'incomplete second part') socket.audio('delta', 'r', { content_index: 1, delta: 'AgA=' });
      socket.audio('done', 'r');
      const output = fault === 'foreign final item' ? [outputItem('another-item')] : [outputItem('sample-item', 2)];
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed', output } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorTtsIncomplete', retryable: false });
  });

  it('rejects the end of a different item even when the output indexes match', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      socket.audio('delta', 'r', { delta: 'AQA=' });
      socket.audio('done', 'r', { item_id: 'another-item' });
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed' } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorTtsInvalidAudio', retryable: false });
  });

  it('reports a stalled credential mint as a timeout without opening a socket', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const result = textToSpeech('Article.', 'synthetic-key').catch(error => error);
    await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS);
    expect(await result).toMatchObject({ name: 'TimeoutError', translationKey: 'errorTtsTimeout', retryable: false });
    expect(WebSocket.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled credential request and releases its timers', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const result = textToSpeech('Article.', 'synthetic-key').catch(error => error);
    let finished = false; result.then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    owner.cancelled = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(finished).toBe(true);
    expect(await result).toMatchObject({ message: 'Cancelled' });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(WebSocket.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled socket and ignores its late terminal event', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(() => {}));
    const result = textToSpeech('Article.', 'synthetic-key').catch(error => error);
    let finished = false; result.then(() => { finished = true; });
    await vi.waitFor(() => expect(WebSocket.instances).toHaveLength(1), { interval: 1 });
    const socket = WebSocket.instances[0];
    const lateMessage = socket.onmessage;
    owner.cancelled = true;
    await vi.advanceTimersByTimeAsync(250);
    expect(finished).toBe(true);
    expect(await result).toMatchObject({ message: 'Cancelled' });
    socket.complete();
    await lateMessage({ data: JSON.stringify({ type: 'response.done', response: { id: 'r', status: 'completed' } }) });
    expect(socket.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one deadline across authentication and a stalled response', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(() => {}));
    const result = textToSpeech('Article.', 'synthetic-key').catch(error => error);
    await vi.waitFor(() => expect(WebSocket.instances).toHaveLength(1), { interval: 1 });
    await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS);
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 403, 429, 500])('preserves HTTP %s without exposing provider response content', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'synthetic-private-provider-content' } }), { status })));
    const error = await textToSpeech('Article.', 'synthetic-key').catch(error => error);
    expect(error).toMatchObject({ status, translationKey: 'errorTtsApiError', translationParams: { status } });
    expect(error.message).not.toContain('synthetic-private-provider-content');
    expect(WebSocket.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { code: 'organization_spend_limit_exceeded' },
    { type: 'insufficient_quota' }
  ])('stops at a single credential request when the billing quota is exhausted', async details => {
    vi.useRealTimers();
    const privateDetails = 'Provider echoed request content';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { ...details, message: privateDetails }
    }), { status: 429 })));

    const error = await callWithRetry(() => textToSpeech('Article.', 'synthetic-key'), {
      maxRetries: 1, delays: [0]
    }).catch(error => error);

    expect(error).toMatchObject({ status: 429, translationKey: 'errorApiQuotaExceeded', retryable: false });
    expect(error.message).not.toContain(privateDetails);
    expect(fetch).toHaveBeenCalledOnce();
    expect(WebSocket.instances).toHaveLength(0);
  });

  it('retries a temporary rate limit on the credential request before opening the socket', async () => {
    vi.useRealTimers();
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({
      error: { code: 'rate_limit_exceeded' }
    }), { status: 429 }));

    const result = await callWithRetry(() => textToSpeech('Article.', 'synthetic-key'), {
      maxRetries: 1, delays: [0]
    });

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(WebSocket.instances).toHaveLength(1);
    expect(WebSocket.instances[0].closed).toBe(true);
  });

  it('does not copy WebSocket constructor errors containing credentials into diagnostics', async () => {
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('synthetic-key ek_synthetic'); } });
    const error = await textToSpeech('Article.', 'synthetic-key').catch(error => error);
    expect(error).toMatchObject({ translationKey: 'errorTtsConnectionFailed' });
    expect(error.message).not.toContain('synthetic-key');
    expect(error.message).not.toContain('ek_synthetic');
    expect(vi.getTimerCount()).toBe(0);
  });
});
