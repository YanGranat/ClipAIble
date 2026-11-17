import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  cleanupTTSResources: vi.fn(),
  handlePing: vi.fn((_id, sendResponse) => sendResponse({ success: true })),
  handleGetPdfPageDimensions: vi.fn(async (_id, _data, sendResponse) => sendResponse({ success: true, width: 600, height: 800 })),
  initPiperTTS: vi.fn(async () => ({})),
  processingRunId: null
}));

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn()
}));
vi.mock('../../scripts/utils/logging/logging-port.js', () => ({ initLogPort: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { LOG_LEVEL: 2 } }));
vi.mock('../../scripts/offscreen/state.js', () => ({
  state: {
    cleanupTTSResources: handlers.cleanupTTSResources,
    getProcessingRunId: () => handlers.processingRunId,
    setProcessingRunId: value => { handlers.processingRunId = value; }
  }
}));
vi.mock('../../scripts/offscreen/message-handlers.js', () => ({
  handlePing: handlers.handlePing,
  handleGetPdfPageDimensions: handlers.handleGetPdfPageDimensions,
  handleGetVoices: vi.fn(), handleGetStoredVoices: vi.fn(),
  handleExtractPdf: vi.fn(), handleExtractPdfPageText: vi.fn(),
  handleGetPdfMetadata: vi.fn(), handleRenderPdfPageImage: vi.fn(),
  handleRenderAllPdfPages: vi.fn()
}));
vi.mock('../../scripts/offscreen/tts/init.js', () => ({ initPiperTTS: handlers.initPiperTTS }));
vi.mock('../../scripts/offscreen/tts/handler.js', () => ({ handlePiperTTS: vi.fn() }));
vi.mock('../../scripts/offscreen/worker/init.js', () => ({ initTTSWorker: vi.fn(), ensureTTSWorker: vi.fn() }));
vi.mock('../../scripts/offscreen/worker/lifecycle.js', () => ({ resetWorkerInactivityTimer: vi.fn() }));
vi.mock('../../scripts/offscreen/worker/api.js', () => ({
  predictWithWorker: vi.fn(), getVoicesWithWorker: vi.fn(),
  getStoredWithWorker: vi.fn(), downloadWithWorker: vi.fn(), removeWithWorker: vi.fn()
}));

describe('Offscreen message routing', () => {
  let listener;

  beforeAll(async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), location: { href: 'chrome-extension://test-extension-id/offscreen.html' } });
    vi.stubGlobal('document', { title: 'Offscreen Document', readyState: 'complete', addEventListener: vi.fn() });
    vi.stubGlobal('navigator', { userAgent: 'Chrome/130' });
    chrome.runtime.onMessage.addListener.mockClear();
    await import('../../offscreen.js');
    expect(handlers.initPiperTTS).not.toHaveBeenCalled();
    listener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf('function');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.processingRunId = null;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('releases resources and acknowledges cleanup requests', () => {
    const reply = vi.fn();
    expect(listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES' }, {}, reply)).toBe(true);
    expect(handlers.cleanupTTSResources).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('reports a cleanup failure', () => {
    handlers.cleanupTTSResources.mockImplementationOnce(() => { throw new Error('Cleanup failed'); });
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES' }, {}, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Cleanup failed' }));
  });

  it('ignores cleanup requests belonging to an older synthesis owner', () => {
    handlers.processingRunId = 'replacement';
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES', data: { processingRunId: 'previous' } }, {}, reply);
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, skipped: true }));
  });

  it('records the synthesis owner before processing its message', async () => {
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'PIPER_TTS', data: { text: 'Sample text', processingRunId: 'current' } }, {}, reply);
    await Promise.resolve();
    expect(handlers.processingRunId).toBe('current');
  });

  it('cancels only the matching synthesis owner', () => {
    handlers.processingRunId = 'current';
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CANCEL_TTS', data: { processingRunId: 'previous' } }, {}, reply);
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    listener({ target: 'offscreen', type: 'CANCEL_TTS', data: { processingRunId: 'current' } }, {}, reply);
    expect(handlers.cleanupTTSResources).toHaveBeenCalledOnce();
  });

  it('continues to route page dimension requests', async () => {
    const reply = vi.fn();
    const data = { pdfUrl: 'https://example.com/document.pdf', pageNum: 1 };
    listener({ target: 'offscreen', type: 'GET_PDF_PAGE_DIMENSIONS', data }, {}, reply);
    await Promise.resolve();
    expect(handlers.handleGetPdfPageDimensions).toHaveBeenCalledWith(expect.any(String), data, reply);
    expect(reply).toHaveBeenCalledWith({ success: true, width: 600, height: 800 });
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    expect(handlers.initPiperTTS).not.toHaveBeenCalled();
  });

  it('ignores messages for other extension contexts', () => {
    const reply = vi.fn();
    expect(listener({ target: 'background', type: 'CLEANUP_RESOURCES' }, {}, reply)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
  });
});
