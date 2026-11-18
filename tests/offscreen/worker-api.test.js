import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  worker: null
}));

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logError: vi.fn(), logWarn: vi.fn()
}));
vi.mock('../../scripts/offscreen/worker/init.js', () => ({
  ensureTTSWorker: async () => dependencies.worker
}));
vi.mock('../../scripts/offscreen/worker/lifecycle.js', () => ({
  resetWorkerInactivityTimer: vi.fn()
}));

import { predictWithWorker, getVoicesWithWorker, getStoredWithWorker, downloadWithWorker, removeWithWorker } from '../../scripts/offscreen/worker/api.js';
import { state } from '../../scripts/offscreen/state.js';

describe('TTS worker requests', () => {
  let listeners;
  let request;

  beforeEach(() => {
    vi.useFakeTimers();
    state.reset();
    listeners = { message: new Set(), error: new Set() };
    dependencies.worker = {
      addEventListener: (type, listener) => listeners[type].add(listener),
      removeEventListener: (type, listener) => listeners[type].delete(listener),
      postMessage: value => { request = value; },
      terminate: vi.fn()
    };
    state.setTTSWorker(dependencies.worker);
  });

  afterEach(() => {
    state.reset();
    vi.useRealTimers();
  });

  async function startRequest() {
    const result = predictWithWorker('A short sentence.', 'en_US-lessac-medium');
    await Promise.resolve();
    expect(state.getActivePredictCalls()).toBe(1);
    expect(request.type).toBe('PREDICT');
    return { result };
  }

  function emit(type, data) {
    for (const listener of [...listeners[type]]) listener(data);
  }

  function expectReleased() {
    expect(state.getActivePredictCalls()).toBe(0);
    expect(listeners.message.size).toBe(0);
    expect(listeners.error.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(state.workerRequests.size).toBe(0);
  }

  it('releases both listeners after each successful request', async () => {
    for (let n = 0; n < 3; n++) {
      const { result } = await startRequest();
      emit('message', { data: { id: request.id, type: 'PREDICT_SUCCESS', data: new Uint8Array([1, 2]).buffer } });
      expect((await result).size).toBe(2);
      expectReleased();
    }
  });

  it('releases both listeners after a request error', async () => {
    const { result } = await startRequest();
    const rejected = expect(result).rejects.toThrow('Synthesis failed');
    emit('message', { data: { id: request.id, type: 'ERROR', error: 'Synthesis failed' } });
    await rejected;
    expectReleased();
    expect(dependencies.worker.terminate).toHaveBeenCalledOnce();
    expect(state.getTTSWorker()).toBe(null);
  });

  it('releases both listeners after a worker error', async () => {
    const { result } = await startRequest();
    const rejected = expect(result).rejects.toThrow('Worker error during predict');
    emit('error', { message: 'Worker failed' });
    await rejected;
    expectReleased();
  });

  it('releases both listeners when the response times out', async () => {
    const { result } = await startRequest();
    const rejected = expect(result).rejects.toThrow('TTS Worker predict timeout');
    await vi.advanceTimersByTimeAsync(60000);
    await rejected;
    expectReleased();
  });

  it('rejects pending synthesis immediately when its owner releases resources', async () => {
    const { result } = await startRequest();
    const rejected = expect(result).rejects.toThrow('TTS processing cancelled');
    state.cleanupTTSResources();
    expectReleased();
    await rejected;
    expect(dependencies.worker.terminate).toHaveBeenCalledOnce();
  });

  const phases = [
    ['VOICES', getVoicesWithWorker, [], 10000],
    ['STORED', getStoredWithWorker, [], 10000],
    ['DOWNLOAD', downloadWithWorker, {}, 300000],
    ['REMOVE', removeWithWorker, {}, 30000]
  ];

  it.each(phases)('cancels pending %s without affecting a replacement worker', async (_type, acquire) => {
    const pending = acquire('en_US-lessac-medium');
    let settled = false;
    pending.catch(() => { settled = true; });
    await Promise.resolve();
    state.cleanupTTSResources();
    const replacement = { terminate: vi.fn() };
    state.setTTSWorker(replacement);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(pending).rejects.toThrow('TTS processing cancelled');
    expectReleased();
    expect(dependencies.worker.terminate).toHaveBeenCalledOnce();
    expect(state.getTTSWorker()).toBe(replacement);
    expect(replacement.terminate).not.toHaveBeenCalled();
  });

  it.each(phases)('releases %s resources after a successful response', async (type, acquire, data) => {
    const pending = acquire('en_US-lessac-medium');
    await Promise.resolve();
    emit('message', { data: { id: request.id, type: `${type}_SUCCESS`, data } });
    await expect(pending).resolves.toEqual(data);
    expectReleased();
  });

  it.each(phases)('rejects %s promptly when the worker fails', async (_type, acquire) => {
    const pending = acquire('en_US-lessac-medium');
    const rejected = expect(pending).rejects.toThrow('Worker failed');
    await Promise.resolve();
    emit('error', { message: 'Worker failed' });
    await rejected;
    expectReleased();
  });

  it.each(phases)('preserves the %s timeout and releases its listeners', async (_type, acquire, _data, timeout) => {
    const pending = acquire('en_US-lessac-medium');
    const rejected = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(timeout);
    await rejected;
    expectReleased();
  });
});
