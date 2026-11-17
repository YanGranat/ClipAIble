import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/offscreen/worker/lifecycle.js', () => ({ resetWorkerInactivityTimer: vi.fn() }));

import { state } from '../../scripts/offscreen/state.js';
import { initTTSWorker, ensureTTSWorker } from '../../scripts/offscreen/worker/init.js';

describe('TTS worker initialization', () => {
  let worker;
  let listeners;

  beforeEach(() => {
    vi.useFakeTimers();
    state.reset();
    state.clearTTSWorkerInitPromise();
    listeners = new Set();
    worker = {
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      postMessage: vi.fn(), terminate: vi.fn()
    };
    vi.stubGlobal('Worker', vi.fn(function() { return worker; }));
  });
  afterEach(() => {
    state.reset();
    state.clearTTSWorkerInitPromise();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function emit(type) {
    for (const listener of [...listeners]) listener({ data: { type } });
  }

  it.each([initTTSWorker, ensureTTSWorker])('waits for a pending initialization before returning a worker', async acquire => {
    const first = initTTSWorker();
    let secondFinished = false;
    const second = acquire().then(value => { secondFinished = true; return value; });
    await Promise.resolve();
    await Promise.resolve();
    expect(secondFinished).toBe(false);
    expect(Worker).toHaveBeenCalledOnce();
    emit('WORKER_READY');
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'INIT' }));
    emit('INIT_SUCCESS');
    await expect(first).resolves.toBe(worker);
    await expect(second).resolves.toBe(worker);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a retry after a worker constructor failure', async () => {
    Worker.mockImplementationOnce(function() { throw new Error('Creation failed'); });
    await expect(initTTSWorker()).rejects.toThrow('Creation failed');
    expect(state.getTTSWorkerInitPromise()).toBe(null);
    const retry = initTTSWorker();
    emit('WORKER_READY');
    emit('INIT_SUCCESS');
    await expect(retry).resolves.toBe(worker);
    expect(Worker).toHaveBeenCalledTimes(2);
  });

  it('clears failed initialization resources', async () => {
    const pending = initTTSWorker();
    const rejected = expect(pending).rejects.toThrow('Worker initialization failed');
    emit('ERROR');
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(state.getTTSWorker()).toBe(null);
    expect(state.getTTSWorkerInitPromise()).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not terminate a replacement worker when an older initialization fails', async () => {
    const pending = initTTSWorker();
    const rejected = expect(pending).rejects.toThrow('Worker initialization failed');
    const replacement = { terminate: vi.fn() };
    state.setTTSWorker(replacement);
    state.clearTTSWorkerInitPromise();
    emit('ERROR');
    await rejected;
    expect(state.getTTSWorker()).toBe(replacement);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(replacement.terminate).not.toHaveBeenCalled();
  });

  it('rejects a pending initialization immediately on cleanup', async () => {
    const pending = initTTSWorker();
    const rejected = expect(pending).rejects.toThrow('TTS processing cancelled');
    state.cleanupTTSResources();
    expect(vi.getTimerCount()).toBe(0);
    await rejected;
    expect(state.getTTSWorker()).toBe(null);
    expect(state.getTTSWorkerInitPromise()).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});
