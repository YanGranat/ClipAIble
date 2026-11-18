import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../scripts/utils/config.js';

const mocks = vi.hoisted(() => ({ language: vi.fn(async () => 'en'), notification: vi.fn(), popupOpen: false }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: mocks.language, tSync: key => key }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: mocks.notification }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => mocks.popupOpen }));

let state, storage, listener;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  mocks.language.mockReset().mockResolvedValue('en');
  mocks.notification.mockClear();
  mocks.popupOpen = false;
  storage = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  vi.stubGlobal('chrome', { storage: { local: storage }, tabs: { onRemoved: { addListener: fn => { listener = fn; } } } });
  state = await import('../../scripts/state/processing.js');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('processing request lifetime', () => {
  it('carries the real run signal through pipeline options into an active HTTP request', async () => {
    const { getAIRequestOptions } = await import('../../scripts/utils/processing/pipeline-helpers.js');
    const { fetchBufferedResponse } = await import('../../scripts/api/fetch-buffered-response.js');
    await state.startProcessing(vi.fn());
    const run = state.getProcessingRunId(), options = getAIRequestOptions({ processingRunId: run, provider: 'openai' });
    expect(options.signal).toBe(state.getProcessingSignal(run));
    let requestSignal, settled = false;
    vi.stubGlobal('fetch', vi.fn((_url, init) => { requestSignal = init.signal; return new Promise(() => {}); }));
    const result = fetchBufferedResponse('https://api.example.org/request', {}, 1000, options).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    await state.cancelProcessing(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(requestSignal.aborted).toBe(true);
    expect((await result).name).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('expires a stalled run, aborts its signal, persists the deadline and stops keep-alive', async () => {
    const stop = vi.fn();
    state.initPrintTabLifecycle(stop);
    await state.startProcessing(vi.fn());
    const run = state.getProcessingRunId(), signal = state.getProcessingSignal(run);
    expect(state.getProcessingState().inactivityDeadlineAt).toBe(Date.now() + CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS + 1);
    expect(signal.aborted).toBe(true);
    expect(signal.reason.name).toBe('TimeoutError');
    expect(state.getProcessingState()).toMatchObject({ isProcessing: false, errorTranslationKey: 'errorTimeout' });
    expect(storage.set).toHaveBeenLastCalledWith({ processingState: expect.objectContaining({ isProcessing: false, errorTranslationKey: 'errorTimeout', processingRunId: run }) });
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.notification).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes only real progress and admitted requests, without heartbeat extension', async () => {
    await state.startProcessing(vi.fn());
    const run = state.getProcessingRunId(), initial = state.getProcessingState().inactivityDeadlineAt;
    await vi.advanceTimersByTimeAsync(1000);
    state.updateState({ status: 'Still working', progress: 0 }, run);
    expect(state.getProcessingState().inactivityDeadlineAt).toBe(initial);
    state.updateState({ progress: 1 }, run);
    const progressDeadline = state.getProcessingState().inactivityDeadlineAt;
    expect(progressDeadline).toBe(initial + 1000);
    await vi.advanceTimersByTimeAsync(1000);
    state.markProcessingRequestStarted(run);
    expect(state.getProcessingState().inactivityDeadlineAt).toBe(progressDeadline + 1000);
    await vi.advanceTimersByTimeAsync(CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS + 1);
    expect(state.getProcessingSignal(run).aborted).toBe(true);
  });

  it('cancels A synchronously and cannot cancel or update replacement B', async () => {
    await state.startProcessing(vi.fn());
    const runA = state.getProcessingRunId(), signalA = state.getProcessingSignal(runA);
    await state.cancelProcessing(vi.fn());
    expect(signalA.aborted).toBe(true);
    await state.startProcessing(vi.fn());
    const runB = state.getProcessingRunId(), signalB = state.getProcessingSignal(runB);
    state.updateState({ progress: 99 }, runA);
    state.markProcessingRequestStarted(runA);
    expect(state.getProcessingState().progress).toBe(0);
    expect(signalB.aborted).toBe(false);
    expect(state.getProcessingSignal(runA).aborted).toBe(true);
    await state.cancelProcessing(vi.fn());
    expect(signalB.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates startup at its deadline while localization is stalled', async () => {
    let resolveLanguage;
    mocks.language.mockReturnValueOnce(new Promise(resolve => { resolveLanguage = resolve; }));
    const startup = state.startProcessing(vi.fn());
    const run = state.getProcessingRunId(), signal = state.getProcessingSignal(run);
    await vi.advanceTimersByTimeAsync(CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS + 1);
    expect(signal.aborted).toBe(true);
    expect(state.getProcessingState()).toMatchObject({ isProcessing: false, errorTranslationKey: 'errorTimeout' });
    resolveLanguage('en');
    expect(await startup).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes cancellation before a stalled storage read can finish', async () => {
    await state.startProcessing(vi.fn());
    const signal = state.getProcessingSignal(state.getProcessingRunId());
    let release;
    storage.get.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const cancellation = state.cancelProcessing(vi.fn());
    expect(signal.aborted).toBe(true);
    expect(state.getProcessingState().isCancelled).toBe(true);
    release({});
    await cancellation;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('deduplicates failed-run notifications and suppresses them while the popup is open', async () => {
    await state.startProcessing(vi.fn());
    const run = state.getProcessingRunId();
    const failure = Object.assign(new Error('Unavailable'), { translationKey: 'errorNetwork', translationParams: {} });
    await state.setError(failure, vi.fn(), run);
    await state.setError(failure, vi.fn(), run);
    await vi.dynamicImportSettled();
    expect(mocks.notification).toHaveBeenCalledTimes(1);
    await state.startProcessing(vi.fn());
    mocks.popupOpen = true;
    await state.setError(failure, vi.fn(), state.getProcessingRunId());
    await vi.dynamicImportSettled();
    expect(mocks.notification).toHaveBeenCalledTimes(1);
  });
});
