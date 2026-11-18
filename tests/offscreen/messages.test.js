import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  cleanupTTSResources: vi.fn(),
  handlePing: vi.fn((_id, sendResponse) => sendResponse({ success: true })),
  handleRenderAllPdfPages: vi.fn(async (_id, _data, sendResponse) => sendResponse({ success: true, images: [{ pageNum: 1, ref: 'sample-operation:1', width: 600, height: 800 }] })),
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
  handleRenderAllPdfPages: handlers.handleRenderAllPdfPages,
  handleGetVoices: vi.fn(), handleGetStoredVoices: vi.fn(),
  handleExtractPdf: vi.fn(),
  handleGetPdfMetadata: vi.fn(),
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
  const trustedSender = { id: 'test-extension-id', url: 'chrome-extension://test-extension-id/scripts/background.js' };

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
    expect(listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES' }, trustedSender, reply)).toBe(true);
    expect(handlers.cleanupTTSResources).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('reports a cleanup failure', () => {
    handlers.cleanupTTSResources.mockImplementationOnce(() => { throw new Error('Cleanup failed'); });
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES' }, trustedSender, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Cleanup failed' }));
  });

  it('ignores cleanup requests belonging to an older synthesis owner', () => {
    handlers.processingRunId = 'replacement';
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES', data: { processingRunId: 'previous' } }, trustedSender, reply);
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, skipped: true }));
  });

  it('records the synthesis owner before processing its message', async () => {
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'PIPER_TTS', data: { text: 'Sample text', processingRunId: 'current' } }, trustedSender, reply);
    await Promise.resolve();
    expect(handlers.processingRunId).toBe('current');
  });

  it('cancels only the matching synthesis owner', () => {
    handlers.processingRunId = 'current';
    const reply = vi.fn();
    listener({ target: 'offscreen', type: 'CANCEL_TTS', data: { processingRunId: 'previous' } }, trustedSender, reply);
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    listener({ target: 'offscreen', type: 'CANCEL_TTS', data: { processingRunId: 'current' } }, trustedSender, reply);
    expect(handlers.cleanupTTSResources).toHaveBeenCalledOnce();
  });

  it('continues to route PDF render requests', async () => {
    const reply = vi.fn();
    const data = { pdfUrl: 'https://example.com/document.pdf', pageNum: 1 };
    listener({ target: 'offscreen', type: 'RENDER_ALL_PDF_PAGES', data }, trustedSender, reply);
    await Promise.resolve();
    expect(handlers.handleRenderAllPdfPages).toHaveBeenCalledWith(expect.any(String), data, reply);
    expect(reply).toHaveBeenCalledWith({ success: true, images: [{ pageNum: 1, ref: 'sample-operation:1', width: 600, height: 800 }] });
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    expect(handlers.initPiperTTS).not.toHaveBeenCalled();
  });

  it('ignores messages for other extension contexts', () => {
    const reply = vi.fn();
    expect(listener({ target: 'background', type: 'CLEANUP_RESOURCES' }, trustedSender, reply)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
  });

  it('rejects offscreen commands from an untrusted content context', () => {
    const reply = vi.fn();
    expect(listener({ target: 'offscreen', type: 'CLEANUP_RESOURCES' }, { id: 'test-extension-id', tab: { id: 1 }, url: 'https://example.org/' }, reply)).toBe(false);
    expect(handlers.cleanupTTSResources).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});
