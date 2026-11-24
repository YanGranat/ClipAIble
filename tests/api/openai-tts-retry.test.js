import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { textToSpeech, chunksToSpeech } from '../../scripts/api/tts.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { resetState, startProcessing, getProcessingRunId } from '../../scripts/state/processing.js';
import { realtimeWebSocket } from '../helpers/realtime-websocket.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
const retryDelays = [...CONFIG.RETRY_DELAYS];
const retryAttempts = CONFIG.RETRY_MAX_ATTEMPTS;
beforeEach(async () => {
  CONFIG.RETRY_DELAYS.splice(0, CONFIG.RETRY_DELAYS.length, 1);
  CONFIG.RETRY_MAX_ATTEMPTS = 1;
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  await resetState(); await startProcessing(vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: 'ek_synthetic' }))));
  vi.stubGlobal('WebSocket', realtimeWebSocket(socket => {
    if (WebSocket.instances.length > 1) { socket.complete(); return; }
    socket.emit({ type: 'response.created', response: { id: 'r' } });
    socket.audio('delta', 'r', { delta: 'AQA=' });
    socket.emit({ type: 'error', error: { code: 'server_error' } });
  }));
});
afterEach(async () => { CONFIG.RETRY_MAX_ATTEMPTS = retryAttempts; CONFIG.RETRY_DELAYS.splice(0, CONFIG.RETRY_DELAYS.length, ...retryDelays); await resetState(); vi.unstubAllGlobals(); });

it('does not resubmit an admitted speech response through the direct-call retry wrapper', async () => {
  await expect(textToSpeech('Article.', 'synthetic-key', { provider: 'openai', processingRunId: getProcessingRunId() }))
    .rejects.toMatchObject({ retryable: false, status: 500 });
  expect(WebSocket.instances).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not retry or start later chunks after an admitted speech response fails', async () => {
  await expect(chunksToSpeech([{ text: 'First.', index: 0 }, { text: 'Second.', index: 1 }], 'synthetic-key', { provider: 'openai', processingRunId: getProcessingRunId() }))
    .rejects.toMatchObject({ retryable: false, status: 500 });
  expect(WebSocket.instances).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('applies one retry budget to temporary failures before generation is admitted', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
  await expect(chunksToSpeech([{ text: 'Article.', index: 0 }], 'synthetic-key', { provider: 'openai', processingRunId: getProcessingRunId() })).rejects.toBeInstanceOf(Error);
  expect(fetch).toHaveBeenCalledTimes(CONFIG.RETRY_MAX_ATTEMPTS + 1);
  expect(WebSocket.instances).toHaveLength(0);
});

it.each(['openai', 'google', 'elevenlabs', 'qwen', 'respeecher'])('cancels pending %s speech retries without waiting for Retry-After', async provider => {
  vi.useFakeTimers();
  const owner = new AbortController();
  const reason = new DOMException('Operation cancelled', 'AbortError');
  const schedule = vi.spyOn(globalThis, 'setTimeout');
  const request = vi.fn(async () => new Response('{}', { status: 503, headers: { 'Retry-After': '20' } }));
  vi.stubGlobal('fetch', request);
  let outcome;
  const pending = textToSpeech('Article.', 'synthetic-key', {
    provider, signal: owner.signal, processingRunId: getProcessingRunId(), language: 'en', qwenWorkspaceId: 'sample-workspace'
  }).then(value => { outcome = { value }; }, error => { outcome = { error }; });
  try {
    await vi.waitFor(() => expect(schedule.mock.calls.some(([, delay]) => delay >= 20000 && delay <= 24000)).toBe(true));
    expect(request).toHaveBeenCalledOnce();
    owner.abort(reason);
    await vi.advanceTimersByTimeAsync(75);
    expect(outcome?.error).toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
  } finally {
    owner.abort(reason);
    await vi.advanceTimersByTimeAsync(25000);
    await pending;
    schedule.mockRestore();
    vi.useRealTimers();
  }
});

it.each(['unknown', '__proto__', 'constructor'])('rejects unsupported provider %s without sending a key to another provider', async provider => {
  await expect(textToSpeech('Article.', 'synthetic-key', { provider })).rejects.toMatchObject({ translationKey: 'errorUnknownAudioProvider', translationParams: { provider } });
  expect(fetch).not.toHaveBeenCalled();
  expect(WebSocket.instances).toHaveLength(0);
});
