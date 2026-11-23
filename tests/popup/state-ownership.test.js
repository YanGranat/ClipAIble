import { afterEach, expect, it, vi } from 'vitest';
import { initState } from '../../popup/core/state.js';
import { formatMessage } from '../../scripts/locales.js';

afterEach(() => vi.unstubAllGlobals());

it.each(['initial check', 'polling'])('displays the background initialization error during %s and recovers on a valid response', async phase => {
  vi.useFakeTimers();
  try {
    const error = { success: false, error: 'Background initialization failed', translationKey: 'errorBackgroundInitializationFailed', translationParams: {} };
    let response = error;
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(response));
    const renders = [];
    vi.stubGlobal('requestAnimationFrame', callback => renders.push(callback));
    const setStatus = vi.fn();
    const state = initState({ elements: { savePdfBtn: { style: {} } }, t: async key => key,
      setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(),
      checkSummaryStatus: async () => {}, stateRefs: { statePollingTimeout: { current: null } } });
    if (phase === 'initial check') await state.checkProcessingState();
    else state.startStatePolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(renders).toHaveLength(1);
    await renders.shift()();
    expect(setStatus).toHaveBeenLastCalledWith('error', 'errorBackgroundInitializationFailed', null,
      { key: 'errorBackgroundInitializationFailed', params: {} });
    response = { isProcessing: false, status: 'idle' };
    await state.checkProcessingState();
    expect(renders).toHaveLength(1);
    await renders.shift()();
    expect(setStatus).toHaveBeenLastCalledWith('ready', 'ready', null, { key: 'ready' });
  } finally {
    vi.useRealTimers();
  }
});

it.each(['cancelled', 'old error', 'connection failure'])('does not remove a new background run after reading %s state', async kind => {
  const previous = kind === 'cancelled'
    ? { isCancelled: true, lastUpdate: Date.now() }
    : { isProcessing: false, error: 'Earlier error', lastUpdate: Date.now() - 20000 };
  const stored = { processingState: previous };
  chrome.storage.local.get.mockImplementation(async () => ({ processingState: previous }));
  chrome.storage.local.remove.mockImplementation(async keys => { for (const key of keys) delete stored[key]; });
  let respond;
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => { respond = callback; });
  const state = initState({ elements: {}, t: async key => key, log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), stateRefs: {} });
  const pending = state.checkProcessingState();
  const current = { isProcessing: true, processingRunId: 'current-run', lastUpdate: Date.now() };
  stored.processingState = current;
  if (kind === 'connection failure') chrome.runtime.lastError = { message: 'Receiving end does not exist' };
  respond(null);
  chrome.runtime.lastError = null;
  await pending;
  expect(stored.processingState).toBe(current);
  expect(chrome.storage.local.remove).not.toHaveBeenCalled();
});

it.each([
  [2, 'Ready: PDF. Image translation failures: 2.', 'notificationReadyWithImageFailures'],
  [undefined, 'Ready: PDF', 'notificationReady']
])('displays the final document status for image failure count %s', async (imageTranslationFailureCount, text, key) => {
  const terminalState = { isProcessing: false, status: 'Done!', statusTranslationKey: 'statusDone', outputFormat: 'pdf',
    imageTranslationFailureCount };
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(terminalState));
  chrome.storage.local.get.mockResolvedValue({ processingState: terminalState });
  let render;
  vi.stubGlobal('requestAnimationFrame', callback => { render = callback; return 1; });
  const setStatus = vi.fn();
  const state = initState({
    elements: { savePdfBtn: { style: {} } },
    t: async (name, language, params) => formatMessage(name, language || 'en', params),
    setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(), stateRefs: {}
  });

  await state.checkProcessingState();
  expect(render).toBeTypeOf('function');
  await render();

  expect(setStatus).toHaveBeenCalledExactlyOnceWith('ready', text, null, {
    key, formatKey: 'formatPdf', params: imageTranslationFailureCount ? { format: 'PDF', count: imageTranslationFailureCount } : { format: 'PDF' }
  });
});
