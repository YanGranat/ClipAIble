import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({ currentRun: 'current', worker: null }));
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), criticalLog: vi.fn()
}));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: {
  OFFLINE_TTS_NEXT_TICK_DELAY: 0, OFFLINE_TTS_SETUP_DELAY: 0,
  OFFScreen_TTS_TIMEOUT_BASE: 60000, OFFScreen_TTS_TIMEOUT_MAX: 18000000,
  OFFScreen_TTS_TIMEOUT_PER_CHAR: 100, ABSOLUTE_MAX_OPERATION_TIMEOUT_MS: 86400000,
  OFFScreen_TTS_HEARTBEAT_EXTENSION: 1800000, OFFScreen_TTS_HEARTBEAT_INTERVAL: 60000,
  PDF_PARSE_TIMEOUT_MS: 1000, PDF_FIRST_PAGE_RENDER_TIMEOUT_MS: 1000, PDF_RENDER_TIMEOUT_MS: 1000,
  OFFScreen_TTS_CLEANUP_TIMEOUT_MS: 300000
} }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: runId => !!runId && runId !== dependencies.currentRun }));
vi.mock('../../scripts/locales.js', () => ({ tSync: key => key }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/utils/processing/pipeline-helpers.js', () => ({ checkCancellation: async () => {} }));
vi.mock('../../scripts/api/pdf-storage.js', () => ({ savePdfData: vi.fn(async () => {}), removePdfData: vi.fn(async () => {}), validatePdfData: vi.fn() }));
vi.mock('../../scripts/offscreen/worker/init.js', () => ({ ensureTTSWorker: async () => dependencies.worker }));

describe('Shared offscreen document API', () => {
  let tts;
  let pdf;
  let exists;
  let onMessage;
  let cleanupReply;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    dependencies.currentRun = 'current';
    exists = true;
    cleanupReply = null;
    onMessage = null;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: path => `chrome-extension://test-extension-id/${path}`,
        getManifest: () => ({ permissions: [] }),
        getContexts: vi.fn(async () => exists ? [{ documentId: 'offscreen' }] : []),
        sendMessage: vi.fn((message, callback) => {
          if (onMessage && onMessage(message, callback)) return;
          if (message.type === 'PING') callback({ success: true, ready: true });
          else if (message.type === 'PIPER_TTS') callback({ success: true, method: 'inline', audioData: [1, 2] });
          else if (message.type === 'GET_PDF_METADATA') callback({ success: true, numPages: 1, metadata: {} });
          else callback({ success: true, voices: [] });
        })
      },
      offscreen: {
        hasDocument: vi.fn(async () => exists),
        createDocument: vi.fn(async () => { exists = true; }),
        closeDocument: vi.fn(async () => { exists = false; })
      },
      storage: { local: { get: vi.fn(), remove: vi.fn(async () => {}) } }
    });
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 100, usage: 1 }) } });
    tts = await import('../../scripts/api/offline-tts-offscreen.js');
    pdf = await import('../../scripts/api/pdf-offscreen.js');
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('reuses a document that another feature already opened', async () => {
    await expect(pdf.getPdfMetadata('https://example.com/document.pdf')).resolves.toEqual({ numPages: 1, metadata: {} });
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('creates one shared document for concurrent PDF and voice requests', async () => {
    exists = false;
    const pending = Promise.all([pdf.getPdfMetadata('https://example.com/document.pdf'), tts.getAvailableVoices()]);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
  });

  it('retries a failed readiness check without duplicating the requested operation', async () => {
    let pings = 0;
    onMessage = (message, callback) => {
      if (message.type !== 'PING' || pings++ !== 0) return false;
      chrome.runtime.lastError = { message: 'Receiving end does not exist' };
      callback();
      delete chrome.runtime.lastError;
      return true;
    };
    const pending = tts.getAvailableVoices();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual([]);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'GET_VOICES')).toHaveLength(1);
  });

  it('removes transferred audio after copying it from storage', async () => {
    const key = 'clipaible_audio_sample';
    onMessage = (message, callback) => {
      if (message.type !== 'PIPER_TTS') return false;
      callback({ success: true, method: 'storage', storageKey: key, size: 2 });
      return true;
    };
    chrome.storage.local.get.mockResolvedValue({ [key]: [1, 2] });
    const pending = tts.textToSpeech('Sample text', { processingRunId: 'current' });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).byteLength).toBe(2);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([key, `${key}_meta`]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes a transferred response belonging to a cancelled run', async () => {
    const key = 'clipaible_audio_sample';
    let finish;
    onMessage = (message, callback) => {
      if (message.type !== 'PIPER_TTS') return false;
      finish = callback;
      return true;
    };
    const pending = tts.textToSpeech('Sample text', { processingRunId: 'current' });
    const rejected = expect(pending).rejects.toThrow('errorOffscreenTtsFailed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(finish).toBeTypeOf('function');
    dependencies.currentRun = 'replacement';
    finish({ success: true, method: 'storage', storageKey: key, size: 2 });
    await rejected;
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([key, `${key}_meta`]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for IndexedDB deletion before closing its connection', async () => {
    const key = 'clipaible_audio_sample';
    let finish;
    const transaction = {
      objectStore: () => ({ delete: vi.fn(() => { finish = () => transaction.oncomplete(); }) })
    };
    const db = { transaction: () => transaction, close: vi.fn() };
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { result: db };
      Promise.resolve().then(() => request.onsuccess());
      return request;
    } });
    const pending = tts.cleanupStoredAudio(key, 'indexeddb');
    await Promise.resolve();
    await Promise.resolve();
    expect(finish).toBeTypeOf('function');
    expect(db.close).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(db.close).toHaveBeenCalledOnce();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('releases the synthesis queue when a cancelled owner receives a cancellation response', async () => {
    let oldReply;
    onMessage = (message, callback) => {
      if (message.type === 'PIPER_TTS' && message.data.processingRunId === 'current') {
        oldReply = callback;
        return true;
      }
      if (message.type === 'CANCEL_TTS') {
        expect(message.data.processingRunId).toBe('current');
        oldReply({ success: false, error: 'TTS processing cancelled' });
        callback({ success: true });
        return true;
      }
      return false;
    };
    const old = tts.textToSpeech('Old text', { processingRunId: 'current' });
    let oldSettled = false;
    old.catch(() => { oldSettled = true; });
    const rejected = expect(old).rejects.toThrow('errorOffscreenTtsFailed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(oldReply).toBeTypeOf('function');
    dependencies.currentRun = 'replacement';
    const replacement = tts.textToSpeech('New text', { processingRunId: 'replacement' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'PIPER_TTS')).toHaveLength(1);
    await expect(tts.cancelOfflineTTSRun('current')).resolves.toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(oldSettled).toBe(true);
    await rejected;
    await vi.advanceTimersByTimeAsync(1000);
    expect((await replacement).byteLength).toBe(2);
    const { ttsQueue } = await import('../../scripts/api/tts-queue.js');
    expect(ttsQueue.getStatus()).toEqual({ processing: false, queueLength: 0, activeRequests: 0 });
  });

  it('admits queued prediction immediately after cancelling an actual worker download', async () => {
    const { state } = await import('../../scripts/offscreen/state.js');
    const { downloadWithWorker, predictWithWorker } = await import('../../scripts/offscreen/worker/api.js');
    const posts = [];
    function createWorker() {
      const listeners = { message: new Set(), error: new Set() };
      return {
        listeners, terminate: vi.fn(),
        addEventListener: (type, listener) => listeners[type].add(listener),
        removeEventListener: (type, listener) => listeners[type].delete(listener),
        postMessage: message => {
          posts.push(message.type);
          if (message.type === 'PREDICT') Promise.resolve().then(() => {
            for (const listener of [...listeners.message]) listener({ data: {
              id: message.id, type: 'PREDICT_SUCCESS', data: new Uint8Array([1, 2]).buffer
            } });
          });
        }
      };
    }
    const previous = createWorker();
    const replacement = createWorker();
    dependencies.worker = previous;
    state.setTTSWorker(previous);
    onMessage = (message, callback) => {
      if (message.type === 'CANCEL_TTS') {
        state.cleanupTTSResources();
        dependencies.worker = replacement;
        state.setTTSWorker(replacement);
        callback({ success: true });
        return true;
      }
      if (message.type !== 'PIPER_TTS') return false;
      const operation = message.data.processingRunId === 'current'
        ? downloadWithWorker('en_US-lessac-medium')
        : predictWithWorker('Sample text', 'en_US-lessac-medium');
      operation.then(() => callback({ success: true, method: 'inline', audioData: [1, 2] }),
        error => callback({ success: false, error: error.message }));
      return true;
    };
    const old = tts.textToSpeech('Old text', { processingRunId: 'current' });
    old.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts).toEqual(['DOWNLOAD']);
    dependencies.currentRun = 'replacement';
    const next = tts.textToSpeech('New text', { processingRunId: 'replacement' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts).toEqual(['DOWNLOAD']);
    await tts.cancelOfflineTTSRun('current');
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts).toEqual(['DOWNLOAD', 'PREDICT']);
    await expect(old).rejects.toThrow('errorOffscreenTtsFailed');
    await expect(next).resolves.toHaveProperty('byteLength', 2);
    expect(previous.listeners.message.size).toBe(0);
    expect(previous.listeners.error.size).toBe(0);
    expect(previous.terminate).toHaveBeenCalledOnce();
    expect(replacement.terminate).not.toHaveBeenCalled();
    expect(state.getTTSWorker()).toBe(replacement);
    expect(state.workerRequests.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    state.reset();
  });
});
