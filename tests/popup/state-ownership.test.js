import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initState } from '../../popup/core/state.js';
import { finalizeInitialization } from '../../popup/utils/init-helpers.js';
import { formatMessage } from '../../scripts/locales.js';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

const running = {
  isProcessing: true, phase: 'running', currentStage: 'analyzing', statusTranslationKey: 'stageAnalyzing',
  progress: 3, processingRunId: '7b4087e2-6c9d-44e1-874f-52f829d5a179', outputFormat: 'pdf'
};

function createObserver(overrides = {}) {
  const renders = [];
  vi.stubGlobal('requestAnimationFrame', callback => { renders.push(callback); return 1; });
  const setStatus = vi.fn(), setProgress = vi.fn(), stopTimerDisplay = vi.fn();
  const savePdfBtn = { style: {} };
  const cancelBtn = { style: {}, classList: { toggle: vi.fn() } };
  const stateRefs = { statePollingTimeout: { current: null } };
  const state = initState({
    elements: { savePdfBtn, cancelBtn }, stateRefs, setStatus, setProgress, stopTimerDisplay,
    checkSummaryStatus: vi.fn(), t: async key => key, ...overrides
  });
  async function paint() {
    while (renders.length) await renders.shift()();
  }
  return { state, setStatus, setProgress, stopTimerDisplay, savePdfBtn, cancelBtn, stateRefs, paint, renders };
}

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

it('renders authoritative progress in the current language while local storage is unavailable', async () => {
  const t = vi.fn(async (key, lang) => formatMessage(key, lang));
  vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
  const { state, setStatus, setProgress, paint } = createObserver({ t });
  chrome.storage.local.get.mockImplementation(() => new Promise(() => {}));
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(running));
  expect(await state.checkProcessingState()).toEqual(running);
  await paint();
  expect(t).toHaveBeenCalledWith('stageAnalyzing', 'ru', {});
  expect(setStatus.mock.lastCall[0]).toBe('processing');
  expect(setProgress).toHaveBeenCalledWith(3);
  expect(chrome.storage.local.get).not.toHaveBeenCalled();
});

it('bounds an explicit read even when neither the worker nor local storage answers', async () => {
  vi.useFakeTimers();
  try {
    const { state } = createObserver();
    chrome.runtime.sendMessage.mockImplementation(() => {});
    chrome.storage.local.get.mockImplementation(() => new Promise(() => {}));
    let finished = false;
    const pending = state.checkProcessingState().then(result => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(12000);
    expect(finished).toBe(true);
    expect(await pending).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

it('clears unconfirmed progress after a disconnect and repaints the same run after recovery', async () => {
  vi.useFakeTimers();
  try {
    const { state, setStatus, setProgress, stopTimerDisplay, savePdfBtn, cancelBtn, paint } = createObserver();
    const delayed = [];
    let connected = true;
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => {
      if (connected) callback(running);
      else delayed.push(callback);
    });
    // A worker can refresh this timestamp without advancing the task.
    chrome.storage.local.get.mockImplementation(async () => ({ processingState: { ...running, lastUpdate: Date.now() } }));
    state.startStatePolling();
    await vi.advanceTimersByTimeAsync(0);
    await paint();
    expect(state.getPresentedProcessingRunId()).toBe(running.processingRunId);
    expect(setProgress).toHaveBeenLastCalledWith(3);
    connected = false;
    await vi.advanceTimersByTimeAsync(31000);
    await paint();
    expect(delayed.length).toBeGreaterThan(1);
    expect(setStatus).toHaveBeenLastCalledWith('error', 'errorCommunicationFailed', null,
      { key: 'errorCommunicationFailed', params: {} });
    expect(setProgress).toHaveBeenLastCalledWith(0, false);
    expect(stopTimerDisplay).toHaveBeenCalled();
    expect(state.getPresentedProcessingRunId()).toBeNull();
    expect(cancelBtn.style.display).toBe('none');
    expect(savePdfBtn.disabled).toBe(false);
    delayed[0]({ ...running, progress: 75 });
    await vi.advanceTimersByTimeAsync(0);
    await paint();
    expect(setProgress).toHaveBeenLastCalledWith(0, false);
    connected = true;
    await vi.advanceTimersByTimeAsync(10000);
    await paint();
    expect(state.getPresentedProcessingRunId()).toBe(running.processingRunId);
    expect(setStatus.mock.lastCall[0]).toBe('processing');
    expect(setProgress).toHaveBeenLastCalledWith(3);
    expect(cancelBtn.style.display).toBe('block');
  } finally {
    vi.useRealTimers();
  }
});

it('does not substitute a previously saved run after a different admission', async () => {
  const { state, setStatus, paint } = createObserver();
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(null));
  chrome.storage.local.get.mockResolvedValue({ processingState: { ...running, lastUpdate: Date.now() } });
  const admittedRunId = 'b2f152d6-93ca-4cd9-9cd6-7884cb58a736';
  state.noteProcessingAdmission(admittedRunId);
  expect(await state.checkProcessingState()).toBeUndefined();
  await paint();
  expect(state.getPresentedProcessingRunId()).toBeNull();
  expect(setStatus).not.toHaveBeenCalled();
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback({ ...running, processingRunId: admittedRunId }));
  await state.checkProcessingState();
  await paint();
  expect(state.getPresentedProcessingRunId()).toBe(admittedRunId);
});

it.each(['summary', 'key theses'])('continues polling the document and other panel while the %s read is pending', async panel => {
  vi.useFakeTimers();
  try {
    const summary = vi.fn(async () => {});
    const keyTheses = vi.fn(async () => {});
    const [stalled, other] = panel === 'summary' ? [summary, keyTheses] : [keyTheses, summary];
    stalled.mockImplementation(() => new Promise(() => {}));
    const { state, setStatus, setProgress, paint } = createObserver({ checkSummaryStatus: summary, checkKeyThesesStatus: keyTheses });
    let current = running;
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(current));
    state.startStatePolling();
    await vi.advanceTimersByTimeAsync(0);
    await paint();
    expect(setProgress).toHaveBeenLastCalledWith(3);
    await vi.advanceTimersByTimeAsync(20000);
    await paint();
    expect(setStatus.mock.lastCall[0]).toBe('processing');
    expect(setProgress).toHaveBeenLastCalledWith(3);
    current = { ...running, isProcessing: false, phase: 'complete', statusTranslationKey: 'statusDone', progress: 100 };
    await vi.advanceTimersByTimeAsync(2000);
    await paint();
    expect(setStatus.mock.lastCall[0]).toBe('ready');
    expect(stalled).toHaveBeenCalledOnce();
    expect(other.mock.calls.length).toBeGreaterThan(1);
  } finally {
    vi.useRealTimers();
  }
});

it('observes the current operation when the popup reopens with an independent panel read pending', async () => {
  vi.useFakeTimers();
  try {
    const checkSummaryStatus = vi.fn(() => new Promise(() => {}));
    const { state, setProgress, paint } = createObserver({ checkSummaryStatus });
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => callback(running));
    vi.stubGlobal('document', { getElementById: () => null, documentElement: { lang: 'en' } });
    let initialized = false;
    const pending = finalizeInitialization({
      settingsModule: { loadSettings: async () => {} },
      uiModule: { applyLocalization: async () => {}, applyTheme: () => {} },
      handlersModule: { setupEventListeners: () => {} },
      coreModule: { ...state, checkSummaryStatus }
    }, () => {}).then(() => { initialized = true; });
    await vi.advanceTimersByTimeAsync(1);
    await paint();
    expect(initialized).toBe(true);
    await pending;
    expect(checkSummaryStatus).toHaveBeenCalledOnce();
    expect(state.getPresentedProcessingRunId()).toBe(running.processingRunId);
    expect(setProgress).toHaveBeenLastCalledWith(3);
  } finally {
    vi.useRealTimers();
  }
});

it('does not render or resume polling after its popup releases the timer owner', async () => {
  vi.useFakeTimers();
  try {
    const { state, setStatus, stateRefs, paint } = createObserver();
    let acknowledge;
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => { acknowledge = callback; });
    state.startStatePolling();
    state.startStatePolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    clearTimeout(stateRefs.statePollingTimeout.current);
    stateRefs.statePollingTimeout.current = null;
    acknowledge(running);
    await vi.advanceTimersByTimeAsync(20000);
    await paint();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(setStatus).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
