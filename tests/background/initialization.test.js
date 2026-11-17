import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initInitialization } from '../../scripts/background/initialization.js';
import { initPortListener } from '../../scripts/background/port-listener.js';

let deps;
let storage;
let onConnect;

beforeEach(() => {
  vi.useFakeTimers();
  storage = {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined)
  };
  onConnect = { addListener: vi.fn() };
  vi.stubGlobal('chrome', { runtime: { onConnect }, storage: { local: storage } });
  deps = {
    log: vi.fn(), logWarn: vi.fn(), CONFIG: { RESET_THRESHOLD_MS: 60000 },
    handleError: vi.fn(async error => ({ message: error.message })),
    clearDecryptedKeyCache: vi.fn(), getProcessingState: vi.fn(() => ({ isProcessing: false })),
    restoreStateFromStorage: vi.fn().mockResolvedValue(undefined),
    runInitialization: vi.fn().mockResolvedValue(undefined), startKeepAlive: vi.fn()
  };
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('background initialization lifecycle', () => {
  it('runs initialization through the actual scheduled entry point', async () => {
    const ready = initInitialization(deps)();
    expect(deps.clearDecryptedKeyCache).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    await ready;
    expect(deps.clearDecryptedKeyCache).toHaveBeenCalledTimes(1);
    expect(deps.runInitialization).toHaveBeenCalledTimes(1);
    expect(deps.restoreStateFromStorage).toHaveBeenCalledTimes(1);
  });

  it('clears interrupted job flags while preserving completed text', async () => {
    storage.get.mockResolvedValue({
      summary_text: 'Summary', key_theses_text: 'Theses',
      summary_generating: true, key_theses_generating: true
    });
    const ready = initInitialization(deps)();
    await vi.advanceTimersByTimeAsync(0);
    await ready;
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.set).toHaveBeenCalledWith({
      summary_generating: false, summary_generating_start_time: null,
      key_theses_generating: false, key_theses_generating_start_time: null,
      key_theses_cancel_requested: false
    });
  });

  it('delegates persisted processing recovery to its state owner', async () => {
    const ready = initInitialization(deps)();
    await vi.advanceTimersByTimeAsync(0);
    await ready;
    expect(storage.get).toHaveBeenCalledWith(['summary_generating', 'key_theses_generating']);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(deps.restoreStateFromStorage).toHaveBeenCalledTimes(1);
    expect(deps.restoreStateFromStorage.mock.invocationCallOrder[0])
      .toBeLessThan(deps.runInitialization.mock.invocationCallOrder[0]);
  });

  it('waits for recovery and persistence before opening the startup gate', async () => {
    let finishRecovery;
    let finishInitialization;
    deps.restoreStateFromStorage.mockReturnValue(new Promise(resolve => { finishRecovery = resolve; }));
    deps.runInitialization.mockReturnValue(new Promise(resolve => { finishInitialization = resolve; }));
    const settled = vi.fn();
    const ready = initInitialization(deps)().then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(deps.runInitialization).not.toHaveBeenCalled();
    finishRecovery();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.runInitialization).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    finishInitialization();
    await ready;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('restores keep-alive for a recent active process', async () => {
    storage.get.mockResolvedValue({
      processingState: { isProcessing: true, lastUpdate: Date.now() - 1000 }
    });
    deps.getProcessingState.mockReturnValue({ isProcessing: true, startTime: Date.now() - 1000 });
    const ready = initInitialization(deps)();
    await vi.advanceTimersByTimeAsync(100);
    await ready;
    expect(storage.remove).not.toHaveBeenCalledWith(['processingState']);
    expect(deps.startKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('does not restore keep-alive for an idle recovered process', async () => {
    deps.getProcessingState.mockReturnValue({ isProcessing: false });
    const ready = initInitialization(deps)();
    await vi.advanceTimersByTimeAsync(100);
    await ready;
    expect(deps.startKeepAlive).not.toHaveBeenCalled();
  });

  it('handles storage-read failure without abandoning default initialization', async () => {
    const error = new Error('Storage unavailable');
    storage.get.mockRejectedValue(error);
    const ready = initInitialization(deps)().catch(reason => reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(await ready).toBe(error);
    expect(deps.handleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      source: 'initialization', errorType: 'stateCheckFailed'
    }));
    expect(deps.runInitialization).toHaveBeenCalledTimes(1);
    expect(deps.startKeepAlive).not.toHaveBeenCalled();
  });
});

describe('background port registration', () => {
  it('registers the actual listener and ignores unrelated port names', () => {
    const setup = initPortListener({ log: vi.fn(), logError: vi.fn(), addLogToCollection: vi.fn() });
    setup();
    expect(onConnect.addListener).toHaveBeenCalledTimes(1);
    const port = { name: 'unrelated', onMessage: { addListener: vi.fn() } };
    onConnect.addListener.mock.calls[0][0](port);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
  });

  it('connects the logging port and forwards a received batch', () => {
    const addLogToCollection = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    initPortListener({ log: vi.fn(), logError: vi.fn(), addLogToCollection })();
    const port = {
      name: 'clipaible_logs', sender: { url: 'chrome-extension://test-extension-id/offscreen.html' },
      onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() }
    };
    onConnect.addListener.mock.calls[0][0](port);
    expect(port.onDisconnect.addListener).toHaveBeenCalledTimes(1);
    port.onMessage.addListener.mock.calls[0][0]({
      type: 'logBatch', logs: [{ message: 'Worker failed', marker: 'TEST', level: 'error', timestamp: 123, data: { count: 2 } }]
    });
    expect(addLogToCollection).toHaveBeenCalledWith('[CRITICAL_LOG TEST] Worker failed', expect.objectContaining({
      timestamp: 123, source: 'offscreen-port', data: { count: 2 }
    }), 'error');
  });
});

