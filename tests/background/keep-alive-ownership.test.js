import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initKeepAlive } from '../../scripts/background/keep-alive.js';
import { CONFIG } from '../../scripts/utils/config.js';

beforeEach(() => {
  vi.useFakeTimers();
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.alarms.clear.mockClear();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function createKeepAlive(getState, save, isIndependentGenerationActive) {
  return initKeepAlive({ CONFIG, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), getProcessingState: getState, saveStateToStorageImmediate: save, isIndependentGenerationActive });
}

describe('keep-alive ownership', () => {
  it('does not persist stale state after cancellation during a ping', async () => {
    let state = { isProcessing: true };
    let releaseRead;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
    const save = vi.fn().mockResolvedValue(undefined);
    const keepAlive = createKeepAlive(() => state, save);
    const ping = keepAlive.performKeepAlivePing();
    await vi.runAllTimersAsync();
    state = { isProcessing: false };
    releaseRead({});
    await vi.runAllTimersAsync();
    expect(await ping).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('keeps state persistence in its owner when a save fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
    const keepAlive = createKeepAlive(() => ({ isProcessing: true }), save);
    const ping = keepAlive.performKeepAlivePing();
    await vi.runAllTimersAsync();
    expect(await ping).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('preserves an active replacement while a previous stop checks flags', async () => {
    let state = { isProcessing: false };
    let releaseRead;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
    const keepAlive = createKeepAlive(() => state, vi.fn());
    const stop = keepAlive.stopKeepAlive();
    state = { isProcessing: true };
    releaseRead({});
    await stop;
    expect(chrome.alarms.clear).not.toHaveBeenCalled();
  });

  it('preserves an independent replacement while a previous stop reads an older flag snapshot', async () => {
    let active = false;
    let releaseRead;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
    const keepAlive = createKeepAlive(() => ({ isProcessing: false }), vi.fn(), () => active);
    const stopping = keepAlive.stopKeepAlive();
    active = true;
    releaseRead({});
    await stopping;
    expect(chrome.alarms.clear).not.toHaveBeenCalled();
  });

  it('keeps active independent work without rewriting generation flags', async () => {
    chrome.storage.local.get.mockResolvedValue({ summary_generating: true, summary_generating_start_time: Date.now() - CONFIG.SUMMARY_STALE_THRESHOLD_MS - 1 });
    const keepAlive = createKeepAlive(() => ({ isProcessing: false }), vi.fn(), () => true);
    const ping = keepAlive.performKeepAlivePing();
    await vi.runAllTimersAsync();
    expect(await ping).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
