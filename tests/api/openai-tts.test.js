import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textToSpeech } from '../../scripts/api/openai-tts.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { realtimeWebSocket } from '../helpers/realtime-websocket.js';

const owner = vi.hoisted(() => ({ cancelled: false }));
const requestTimeout = CONFIG.API_TIMEOUT_MS;
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
      socket.emit({ type: 'response.output_audio.delta', response_id: 'r', delta: 'AQA=' });
      socket.emit({ type: 'response.output_audio.done', response_id: 'r' });
      socket.emit({ type: 'response.done', response: { id: 'r', status } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorTtsIncomplete' });
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['foreign', 'missing-audio-end', 'empty', 'odd', 'invalid-base64', 'malformed-json', 'close'])('rejects %s audio without exporting partial data', async fault => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      if (fault === 'malformed-json') { socket.emit('{'); return; }
      if (fault === 'close') { socket.onclose(); return; }
      if (fault !== 'empty') socket.emit({ type: 'response.output_audio.delta', response_id: fault === 'foreign' ? 'other' : 'r',
        delta: fault === 'invalid-base64' ? '%' : fault === 'odd' ? 'AQ==' : 'AQA=' });
      if (fault !== 'missing-audio-end') socket.emit({ type: 'response.output_audio.done', response_id: 'r' });
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed' } });
    }));
    await expect(textToSpeech('Article.', 'synthetic-key')).rejects.toBeInstanceOf(Error);
    expect(WebSocket.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('joins PCM samples split across WebSocket messages', async () => {
    vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
      socket.emit({ type: 'response.created', response: { id: 'r' } });
      for (const delta of ['AQ==', 'AA==']) socket.emit({ type: 'response.output_audio.delta', response_id: 'r', delta });
      socket.emit({ type: 'response.output_audio.done', response_id: 'r' });
      socket.emit({ type: 'response.done', response: { id: 'r', status: 'completed' } });
    }));
    const result = await textToSpeech('Article.', 'synthetic-key');
    expect([...new Uint8Array(result).subarray(44)]).toEqual([1, 0]);
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

  it('does not copy WebSocket constructor errors containing credentials into diagnostics', async () => {
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('synthetic-key ek_synthetic'); } });
    const error = await textToSpeech('Article.', 'synthetic-key').catch(error => error);
    expect(error).toMatchObject({ translationKey: 'errorTtsConnectionFailed' });
    expect(error.message).not.toContain('synthetic-key');
    expect(error.message).not.toContain('ek_synthetic');
    expect(vi.getTimerCount()).toBe(0);
  });
});
