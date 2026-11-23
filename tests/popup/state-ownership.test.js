import { afterEach, expect, it, vi } from 'vitest';
import { initState } from '../../popup/core/state.js';
import { formatMessage } from '../../scripts/locales.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps a newer worker snapshot visible when an earlier request returns late', async () => {
  const responses = [];
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => responses.push(callback));
  chrome.storage.local.get.mockResolvedValue({});
  const renders = [];
  vi.stubGlobal('requestAnimationFrame', callback => { renders.push(callback); return 1; });
  const setStatus = vi.fn();
  const state = initState({ elements: { savePdfBtn: { style: {} } }, t: async key => key,
    setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(), stateRefs: {} });

  const oldRead = state.checkProcessingState();
  const newRead = state.checkProcessingState();
  expect(responses).toHaveLength(2);
  responses[1]({ isProcessing: true, status: 'New task', processingRunId: 'b2f152d6-93ca-4cd9-9cd6-7884cb58a736', progress: 5 });
  await newRead;
  await renders.shift()();
  responses[0]({ isProcessing: false, statusTranslationKey: 'statusDone', outputFormat: 'markdown',
    processingRunId: 'da67f6fa-e34e-4545-8b45-cb33413e3b3a' });
  await oldRead;
  for (const render of renders) await render();
  expect(setStatus).toHaveBeenCalledExactlyOnceWith('processing', 'New task', undefined, null);
});

it('does not render a previous completion after its translated label is ready', async () => {
  let translateReady;
  const setStatus = vi.fn();
  const savePdfBtn = { style: {} };
  const state = initState({ elements: { savePdfBtn }, stateRefs: {}, setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(),
    t: async key => key === 'notificationReady' ? new Promise(resolve => { translateReady = resolve; }) : key });
  const previous = state.updateUIFromState({ isProcessing: false, statusTranslationKey: 'statusDone', outputFormat: 'pdf' });
  await vi.waitFor(() => expect(translateReady).toBeTypeOf('function'));
  await state.updateUIFromState({ isProcessing: true, status: 'New task', progress: 25 });
  expect(savePdfBtn.disabled).toBe(true);
  translateReady('Previous file is ready');
  await previous;
  expect(savePdfBtn.disabled).toBe(true);
  expect(setStatus).toHaveBeenCalledExactlyOnceWith('processing', 'New task', undefined, null);
});

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
