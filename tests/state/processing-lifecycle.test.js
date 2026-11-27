import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelProcessing, completeProcessing, getProcessingRunId, getProcessingState, getScopedUpdateState, initPrintTabLifecycle, isCancelled, resetState, restoreStateFromStorage, saveStateToStorageImmediate, setError, startProcessing, updateState } from '../../scripts/state/processing.js';
import { getUILanguage } from '../../scripts/locales.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: vi.fn(), tSync: (key) => key }));

let stored;
beforeEach(async () => {
  vi.useFakeTimers();
  stored = {};
  getUILanguage.mockReset().mockResolvedValue('en');
  chrome.tabs.get.mockReset().mockResolvedValue({ url: 'https://example.com/' });
  chrome.tabs.onRemoved = { addListener: vi.fn() };
  chrome.storage.local.get.mockReset().mockImplementation(async (keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])));
  chrome.storage.local.set.mockReset().mockImplementation(async (values) => { Object.assign(stored, values); });
  chrome.storage.local.remove.mockReset().mockImplementation(async (keys) => { for (const key of keys) delete stored[key]; });
  await resetState();
});
afterEach(async () => {
  await resetState();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('processing lifecycle', () => {
  it('admits one concurrent start while language loading is pending', async () => {
    let releaseLanguage;
    getUILanguage.mockImplementationOnce(() => new Promise((resolve) => { releaseLanguage = resolve; }));
    const first = startProcessing(vi.fn());
    const second = startProcessing(vi.fn());
    releaseLanguage('en');
    expect(await Promise.all([first, second])).toEqual([true, false]);
  });

  it.each([
    ['completion', () => completeProcessing(vi.fn()), 5001],
    ['error', () => setError('Example failure', vi.fn()), 10001]
  ])('preserves a newer run when the previous %s cleanup expires', async (_label, finish, delay) => {
    await startProcessing(vi.fn());
    await finish();
    await startProcessing(vi.fn());
    updateState({ stage: 'extracting', progress: 15 });
    await vi.advanceTimersByTimeAsync(delay);
    expect(stored.processingState).toMatchObject({ isProcessing: true, progress: 15 });
  });

  it('retains cancellation for a pending checkpoint', async () => {
    await startProcessing(vi.fn());
    await cancelProcessing(vi.fn());
    expect(getProcessingState().isProcessing).toBe(false);
    expect(getProcessingState().status).toBe('idle');
    expect(isCancelled()).toBe(true);
  });

  it('preserves a storage failure after retries', async () => {
    await startProcessing(vi.fn());
    chrome.storage.local.set.mockRejectedValue(new Error('Storage unavailable'));
    const failure = saveStateToStorageImmediate().catch((error) => error);
    await vi.advanceTimersByTimeAsync(301);
    expect((await failure).message).toBe('Storage unavailable');
  });

  it('rejects stale progress, results, errors, and completion after a new run starts', async () => {
    await startProcessing(vi.fn());
    const oldRunId = getProcessingRunId();
    const oldUpdate = getScopedUpdateState(oldRunId);
    await cancelProcessing(vi.fn());
    await startProcessing(vi.fn());
    const newRunId = getProcessingRunId();
    updateState({ progress: 25, outputFormat: 'markdown', status: 'Current request' }, newRunId);
    oldUpdate({ progress: 95, outputFormat: 'audio' });
    oldUpdate({ status: 'Stale request' });
    await setError('Stale error', vi.fn(), oldRunId);
    await completeProcessing(vi.fn(), oldRunId);
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 25, outputFormat: 'markdown', status: 'Current request', error: null });
    expect(isCancelled(oldRunId)).toBe(true);
    expect(isCancelled(newRunId)).toBe(false);
  });

  it('serializes a pending old write before newer writes without delaying admission', async () => {
    await startProcessing(vi.fn());
    await saveStateToStorageImmediate();
    let releaseWrite;
    chrome.storage.local.set.mockImplementationOnce(async (values) => {
      await new Promise((resolve) => { releaseWrite = resolve; });
      Object.assign(stored, values);
    });
    updateState({ stage: 'extracting', progress: 10 });
    await Promise.resolve();
    expect(releaseWrite).toBeTypeOf('function');
    const cancellation = cancelProcessing(vi.fn());
    expect(await cancellation).toMatchObject({ success: true, cancelledRunId: expect.any(String) });
    expect(await startProcessing(vi.fn())).toBe(true);
    const newRunId = getProcessingRunId();
    updateState({ stage: 'generating', progress: 37, outputFormat: 'markdown' }, newRunId);
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 37, outputFormat: 'markdown' });
    releaseWrite();
    await cancellation;
    await vi.advanceTimersByTimeAsync(1);
    expect(stored.processingState).toMatchObject({ isProcessing: true, progress: 37, outputFormat: 'markdown', processingRunId: newRunId });
  });

  it('invalidates a pending start when cancellation admits a replacement', async () => {
    let releaseLanguage;
    getUILanguage.mockImplementationOnce(() => new Promise((resolve) => { releaseLanguage = resolve; }));
    const pending = startProcessing(vi.fn());
    await cancelProcessing(vi.fn());
    expect(await startProcessing(vi.fn())).toBe(true);
    const replacementId = getProcessingRunId();
    releaseLanguage('en');
    expect(await pending).toBe(false);
    expect(getProcessingRunId()).toBe(replacementId);
    expect(getProcessingState().isProcessing).toBe(true);
  });

  it('uses a fresh identity after worker restart and replacement of restored work', async () => {
    await startProcessing(vi.fn());
    await saveStateToStorageImmediate();
    const oldRunId = getProcessingRunId();
    const restarted = await import('../../scripts/state/processing.js?fresh-worker');
    try {
      const restoration = restarted.restoreStateFromStorage();
      await vi.advanceTimersByTimeAsync(0);
      await restoration;
      expect(restarted.getProcessingRunId()).toBe(oldRunId);
      await restarted.cancelProcessing(vi.fn());
      await restarted.startProcessing(vi.fn());
      expect(restarted.getProcessingRunId()).not.toBe(oldRunId);
      expect(restarted.isCancelled(oldRunId)).toBe(true);
    } finally {
      await restarted.resetState();
    }
  });

  it('keeps independent key theses generation alive after document cancellation', async () => {
    await startProcessing(vi.fn());
    stored.key_theses_generating = true;
    stored.key_theses_generating_start_time = Date.now();
    const stop = vi.fn();
    await cancelProcessing(stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it('does not restore a storage snapshot over an active in-memory operation', async () => {
    await startProcessing(vi.fn());
    updateState({ stage: 'extracting', progress: 24, outputFormat: 'markdown' });
    await saveStateToStorageImmediate();
    const restoring = restoreStateFromStorage();
    await vi.advanceTimersByTimeAsync(0);
    await restoring;
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 24, outputFormat: 'markdown' });
  });

  it('reports interrupted work without restoring obsolete article payloads', async () => {
    stored.processingState = {
      isProcessing: true, processingRunId: crypto.randomUUID(), outputFormat: 'markdown',
      lastUpdate: Date.now(), progress: 82, result: { title: 'Saved article', content: [] }
    };
    stored.lastProcessedResult = { title: 'Saved article', content: [] };
    const restoration = restoreStateFromStorage();
    await vi.advanceTimersByTimeAsync(0);
    await restoration;
    expect(getProcessingState()).toMatchObject({
      isProcessing: false, outputFormat: 'markdown', progress: 82,
      error: 'statusProcessingInterrupted', errorTranslationKey: 'statusProcessingInterrupted',
      statusTranslationKey: 'statusProcessingInterrupted'
    });
    expect(getProcessingState()).not.toHaveProperty('result');
    expect(stored.processingState).not.toHaveProperty('result');
    expect(stored).not.toHaveProperty('lastProcessedResult');
    expect(stored.processingState.isProcessing).toBe(false);
    expect(await startProcessing(vi.fn())).toBe(true);
  });

  it('clears an unused completed snapshot when the worker starts again', async () => {
    stored.processingState = { isProcessing: false, result: { content: [{ type: 'paragraph', text: 'An obsolete document body.' }] } };
    const restoration = restoreStateFromStorage();
    await vi.advanceTimersByTimeAsync(0);
    await restoration;
    expect(stored).not.toHaveProperty('processingState');
    expect(getProcessingState().isProcessing).toBe(false);
    expect(getProcessingState()).not.toHaveProperty('result');
  });

  it.each(['owned', 'missing', 'foreign-extension', 'wrong-job', 'debugger-started'])('checks the saved PDF print tab before restoring %s work', async (kind) => {
    const runId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    stored.processingState = {
      isProcessing: true, processingRunId: runId, outputFormat: 'pdf',
      pdfPrintTabId: 21, pdfPrintJobId: jobId, pdfDebuggerStarted: kind === 'debugger-started',
      lastUpdate: Date.now(), startTime: Date.now(), progress: 95, imageTranslationFailureCount: 2, documentAbstractFailed: true
    };
    let url = `${chrome.runtime.getURL('print/print.html')}?job=${jobId}`;
    if (kind === 'foreign-extension') url = `chrome-extension://other-extension/print/print.html?job=${jobId}`;
    if (kind === 'wrong-job') url = `${chrome.runtime.getURL('print/print.html')}?job=${crypto.randomUUID()}`;
    chrome.tabs.get.mockResolvedValue({ id: 21, url });
    if (kind === 'missing') chrome.tabs.get.mockRejectedValue(new Error('No tab'));
    const restoration = restoreStateFromStorage();
    await vi.advanceTimersByTimeAsync(0);
    await restoration;
    expect(getProcessingState()).toMatchObject({ isProcessing: kind === 'owned', outputFormat: 'pdf', processingRunId: runId });
    if (kind === 'owned') {
      expect(getProcessingState()).toMatchObject({ pdfPrintTabId: 21, pdfPrintJobId: jobId, imageTranslationFailureCount: 2,
        statusTranslationKey: 'statusOpeningPdfGenerator', errorTranslationKey: null, documentAbstractFailed: true });
    } else {
      expect(getProcessingState().error).toBe('statusProcessingInterrupted');
      expect(getProcessingState()).not.toHaveProperty('imageTranslationFailureCount');
      expect(getProcessingState()).not.toHaveProperty('documentAbstractFailed');
    }
  });

  it('fails only an active PDF whose owned print tab closes', async () => {
    const stop = vi.fn();
    initPrintTabLifecycle(stop);
    const onRemoved = chrome.tabs.onRemoved.addListener.mock.calls[0][0];
    await startProcessing(vi.fn());
    updateState({ outputFormat: 'pdf', pdfPrintTabId: 21 });
    onRemoved(22);
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState().isProcessing).toBe(true);
    onRemoved(21);
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState()).toMatchObject({ isProcessing: false, error: 'errorPdfPrintTabClosed',
      errorTranslationKey: 'errorPdfPrintTabClosed', errorTranslationParams: {} });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('ignores a completed print tab and the old tab after a replacement run', async () => {
    initPrintTabLifecycle(vi.fn());
    const onRemoved = chrome.tabs.onRemoved.addListener.mock.calls[0][0];
    await startProcessing(vi.fn());
    updateState({ outputFormat: 'pdf', pdfPrintTabId: 21 });
    await completeProcessing(vi.fn());
    onRemoved(21);
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState()).toMatchObject({ progress: 100, error: null });
    await startProcessing(vi.fn());
    updateState({ outputFormat: 'markdown', progress: 37 });
    onRemoved(21);
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState()).toMatchObject({ isProcessing: true, outputFormat: 'markdown', progress: 37, error: null });
  });
});
