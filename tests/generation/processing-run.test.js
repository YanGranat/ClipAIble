import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';
import { generatePdf, generatePdfWithDebugger } from '../../scripts/generation/pdf.js';
import { startProcessing, cancelProcessing, resetState, getProcessingRunId, getProcessingState, updateState, getScopedUpdateState } from '../../scripts/state/processing.js';
import { translateMetadata } from '../../scripts/translation/index.js';
import { processImagesInBatches } from '../../scripts/utils/images.js';
import { saveLargeData, removeLargeData } from '../../scripts/utils/storage.js';
import { chunksToSpeech } from '../../scripts/api/tts.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/utils/images.js', () => ({ imageToBase64: vi.fn(async () => null), processImagesInBatches: vi.fn(async () => []), embedImages: vi.fn(async html => html) }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: vi.fn(async () => 'en'), tSync: vi.fn(key => key) }));
vi.mock('../../scripts/translation/index.js', () => ({ translateMetadata: vi.fn(async text => text) }));
vi.mock('../../scripts/utils/storage.js', () => ({ saveLargeData: vi.fn(async () => {}), removeLargeData: vi.fn(async () => {}) }));
vi.mock('../../scripts/api/tts.js', () => ({ chunksToSpeech: vi.fn(async () => new ArrayBuffer(16)), getAudioExtension: vi.fn(() => 'wav') }));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function beginRun(format = 'markdown') {
  expect(await startProcessing(vi.fn())).toBe(true);
  const processingRunId = getProcessingRunId();
  updateState({ status: 'Current operation', progress: 37, outputFormat: format }, processingRunId);
  return processingRunId;
}
async function replaceRun() {
  await cancelProcessing(vi.fn());
  return beginRun('markdown');
}
const result = { title: 'Sample article', content: [{ type: 'paragraph', text: 'Sample content' }] };
let createObjectURL, revokeObjectURL;
beforeEach(async () => {
  vi.clearAllMocks();
  global.chrome.storage.local.get.mockResolvedValue({});
  global.chrome.storage.local.set.mockResolvedValue(undefined);
  global.chrome.storage.local.remove.mockResolvedValue(undefined);
  global.chrome.downloads.download = vi.fn(async () => 1);
  global.chrome.windows = { getCurrent: vi.fn(async () => ({ id: 1 })) };
  global.chrome.tabs.create = vi.fn(async () => ({ id: 12 }));
  global.chrome.tabs.remove = vi.fn(async () => {});
  global.chrome.debugger = { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({ data: 'JVBERi0xLjQ=' })) };
  global.fetch = vi.fn(async () => ({ ok: true, text: async () => 'body { color: #111; }' }));
  saveLargeData.mockImplementation(async () => {});
  processImagesInBatches.mockImplementation(async () => []);
  translateMetadata.mockImplementation(async text => text);
  chunksToSpeech.mockImplementation(async () => new ArrayBuffer(16));
  await cancelProcessing(vi.fn());
  resetState();
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample-document');
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(async () => { await cancelProcessing(vi.fn()); createObjectURL?.mockRestore(); revokeObjectURL?.mockRestore(); });

describe('document processing ownership', () => {
  it('carries the processing identity into Markdown and ignores a late metadata response', async () => {
    const pending = deferred();
    translateMetadata.mockReturnValueOnce(pending.promise);
    const oldRun = await beginRun();
    const generation = DocumentGeneratorFactory.generate('markdown', { processingRunId: oldRun, url: 'https://example.org/article', effectiveLanguage: 'fr', apiKey: 'sample-key' }, { ...result, publishDate: '2032-06-19' }, getScopedUpdateState(oldRun));
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(translateMetadata).toHaveBeenCalledOnce());
    const newRun = await replaceRun();
    pending.resolve('Example date');
    await outcome;
    expect(global.chrome.downloads.download).not.toHaveBeenCalled();
    expect(getProcessingRunId()).toBe(newRun);
    expect(getProcessingState().status).toBe('Current operation');
    expect(getProcessingState().progress).toBe(37);
  });

  it.each(['epub', 'fb2'])('rejects a late %s image response before initiating a download', async format => {
    const pending = deferred();
    processImagesInBatches.mockReturnValueOnce(pending.promise);
    const oldRun = await beginRun(format);
    const generation = DocumentGeneratorFactory.generate(format, { processingRunId: oldRun, url: 'https://example.org/article' }, { ...result, content: [...result.content, { type: 'image', src: 'https://example.org/image.png' }] }, getScopedUpdateState(oldRun));
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(processImagesInBatches).toHaveBeenCalledOnce());
    const newRun = await replaceRun();
    pending.resolve([]);
    await outcome;
    expect(global.chrome.downloads.download).not.toHaveBeenCalled();
    expect(getProcessingRunId()).toBe(newRun);
    expect(getProcessingState().progress).toBe(37);
  });

  it('rejects an old audio response and passes the identity to TTS', async () => {
    const pending = deferred();
    chunksToSpeech.mockReturnValueOnce(pending.promise);
    const oldRun = await beginRun('audio');
    const generation = DocumentGeneratorFactory.generate('audio', { processingRunId: oldRun, url: 'https://example.org/article', audioProvider: 'offline', audioVoice: 'en_US-lessac-medium', effectiveLanguage: 'en' }, result, getScopedUpdateState(oldRun));
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(chunksToSpeech).toHaveBeenCalledOnce());
    expect(chunksToSpeech.mock.calls[0][2].processingRunId).toBe(oldRun);
    const newRun = await replaceRun();
    pending.resolve(new ArrayBuffer(16));
    await outcome;
    expect(global.chrome.downloads.download).not.toHaveBeenCalled();
    expect(getProcessingRunId()).toBe(newRun);
    expect(getProcessingState().progress).toBe(37);
  });

  it('keeps PDF preparation and cleanup isolated between overlapping operations', async () => {
    const pending = deferred();
    saveLargeData.mockReturnValueOnce(pending.promise);
    const oldRun = await beginRun('pdf');
    const oldGeneration = generatePdf({ ...result, processingRunId: oldRun }, getScopedUpdateState(oldRun));
    const outcome = expect(oldGeneration).rejects.toThrow();
    await vi.waitFor(() => expect(saveLargeData).toHaveBeenCalledOnce());
    const oldKey = saveLargeData.mock.calls[0][0];
    const newRun = await replaceRun();
    await expect(generatePdf({ ...result, processingRunId: newRun }, getScopedUpdateState(newRun))).resolves.toEqual({ success: true, deferred: true });
    const newKey = saveLargeData.mock.calls[1][0];
    expect(newKey).not.toBe(oldKey);
    expect(saveLargeData.mock.calls[1][1]).toMatchObject({ processingRunId: newRun, title: result.title });
    pending.resolve();
    await outcome;
    expect(removeLargeData).toHaveBeenCalledWith(oldKey);
    expect(removeLargeData).not.toHaveBeenCalledWith(newKey);
    expect(global.chrome.tabs.create).toHaveBeenCalledOnce();
    expect(global.chrome.tabs.create.mock.calls[0][0].url).toContain(`job=${newKey.slice('printJob:'.length)}`);
  });

  it('detaches an owned PDF debugger and rejects a stale print result', async () => {
    const pending = deferred();
    global.chrome.debugger.sendCommand.mockImplementation(async (_target, method) => method === 'Page.printToPDF' ? pending.promise : {});
    const oldRun = await beginRun('pdf');
    const complete = vi.fn(), fail = vi.fn();
    const generation = generatePdfWithDebugger(12, 'Sample', 'multi', 794, 1000, complete, fail, oldRun);
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(global.chrome.debugger.sendCommand).toHaveBeenCalledWith(expect.anything(), 'Page.printToPDF', expect.anything()));
    await replaceRun();
    pending.resolve({ data: 'JVBERi0xLjQ=' });
    await outcome;
    expect(global.chrome.debugger.detach).toHaveBeenCalledOnce();
    expect(global.chrome.downloads.download).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it('does not detach another debugger when attach fails', async () => {
    global.chrome.debugger.attach.mockRejectedValueOnce(new Error('Debugger already attached'));
    await expect(generatePdfWithDebugger(12, 'Sample', 'multi', 794, 1000, vi.fn(), vi.fn())).rejects.toThrow('Debugger already attached');
    expect(global.chrome.debugger.detach).not.toHaveBeenCalled();
  });
});
