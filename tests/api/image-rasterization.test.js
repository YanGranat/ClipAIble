import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ jobs: new Map(), setup: vi.fn(), send: vi.fn(), put: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { API_TIMEOUT_MS: 1000 } }));
vi.mock('../../scripts/utils/logging.js', () => ({ logWarn: vi.fn() }));
vi.mock('../../scripts/api/offscreen-document.js', () => ({ setupOffscreenDocument: state.setup }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: () => false, getProcessingSignal: () => new AbortController().signal }));
vi.mock('../../scripts/api/image-raster-storage.js', () => ({
  putRasterJob: (...args) => state.put(...args),
  takeRasterJob: async id => { const value = state.jobs.get(id); state.jobs.delete(id); return value; },
  removeRasterJob: async id => { state.jobs.delete(id); },
  pruneExpiredRasterJobs: async () => { for (const [id, job] of state.jobs) if (job.expiresAt <= Date.now()) state.jobs.delete(id); }
}));
import { normalizeImageBlob } from '../../scripts/api/image-rasterization.js';

describe('image normalization request ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.jobs.clear(); state.setup.mockReset().mockResolvedValue(); state.send.mockReset();
    state.put.mockReset().mockImplementation(async (id, job) => { state.jobs.set(id, job); });
    vi.stubGlobal('chrome', { runtime: { sendMessage: state.send } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const input = () => new Blob(['image bytes'], { type: 'image/png' });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  it('passes only an operation reference through IPC and consumes its result', async () => {
    const image = input();
    state.send.mockImplementation(async message => {
      expect(message.data).toEqual({ id: expect.any(String), processingRunId: null });
      const job = state.jobs.get(message.data.id);
      expect(job.input).toBe(image);
      expect(job.expiresAt).toBe(Date.now() + 1000);
      state.jobs.set(message.data.id, { ...job, result: image });
      return { success: true };
    });
    await expect(normalizeImageBlob(image)).resolves.toBe(image);
    expect(state.jobs.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels while document setup is pending without admitting a late request', async () => {
    let release; state.setup.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const promise = normalizeImageBlob(input(), { signal: controller.signal });
    const rejected = expect(promise).rejects.toMatchObject({ code: 'IMAGE_CANCELLED' });
    await flush(); controller.abort(); await rejected;
    release(); await flush();
    expect(state.send).not.toHaveBeenCalled(); expect(state.jobs.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans a write that commits after cancellation', async () => {
    let release; state.put.mockImplementation((id, job) => new Promise(resolve => {
      release = () => { state.jobs.set(id, job); resolve(); };
    }));
    const controller = new AbortController();
    const promise = normalizeImageBlob(input(), { signal: controller.signal });
    const rejected = expect(promise).rejects.toMatchObject({ code: 'IMAGE_CANCELLED' });
    await flush(); controller.abort(); await rejected;
    release(); await flush();
    expect(state.jobs.size).toBe(0); expect(state.send).not.toHaveBeenCalled();
  });

  it('bounds document setup with the same operation deadline', async () => {
    state.setup.mockReturnValue(new Promise(() => {}));
    const promise = normalizeImageBlob(input());
    const rejected = expect(promise).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(state.jobs.size).toBe(0); expect(state.send).not.toHaveBeenCalled();
  });

  it('releases an admitted request whose response never returns', async () => {
    state.send.mockImplementation(message => message.type === 'CANCEL_IMAGE_RASTER' ? Promise.resolve({ success: true }) : new Promise(() => {}));
    const promise = normalizeImageBlob(input());
    const rejected = expect(promise).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'CANCEL_IMAGE_RASTER' }));
    expect(state.jobs.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not remove another request when an old response arrives after cancellation', async () => {
    let release; state.send.mockImplementation(message => message.type === 'CANCEL_IMAGE_RASTER' ? Promise.resolve({ success: true }) : new Promise(resolve => { release = resolve; }));
    const controller = new AbortController();
    const promise = normalizeImageBlob(input(), { signal: controller.signal });
    const rejected = expect(promise).rejects.toMatchObject({ code: 'IMAGE_CANCELLED' });
    await vi.waitFor(() => expect(typeof release).toBe('function')); controller.abort(); await rejected;
    state.jobs.set('another-operation', { result: input() });
    release({ success: true }); await flush();
    expect([...state.jobs.keys()]).toEqual(['another-operation']);
  });

  it.each([new Blob(), new Blob(['x'.repeat(50 * 1024 * 1024 + 1)])])('rejects invalid sizes before opening a document', async blob => {
    await expect(normalizeImageBlob(blob)).rejects.toMatchObject({ code: expect.stringMatching(/^IMAGE_(EMPTY|TOO_LARGE)$/) });
    expect(state.setup).not.toHaveBeenCalled(); expect(state.jobs.size).toBe(0);
  });
});
