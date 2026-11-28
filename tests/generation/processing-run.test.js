import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';
import { generatePdf, generatePdfWithDebugger } from '../../scripts/generation/pdf.js';
import { startProcessing, cancelProcessing, resetState, getProcessingRunId, getProcessingState, updateState, getScopedUpdateState } from '../../scripts/state/processing.js';
import { translateMetadata } from '../../scripts/translation/index.js';
import { processImagesInBatches } from '../../scripts/utils/images.js';
import { putPrintJob, removePrintJob } from '../../scripts/api/print-storage.js';
import { downloadBlob } from '../../scripts/api/blob-download.js';
import { chunksToSpeech } from '../../scripts/api/tts.js';
import { getUILanguage } from '../../scripts/locales.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/utils/images.js', () => ({ imageToBase64: vi.fn(async () => null), processImagesInBatches: vi.fn(async () => []), embedImages: vi.fn(async html => html) }));
vi.mock('../../scripts/locales.js', async importOriginal => ({ ...await importOriginal(), getUILanguage: vi.fn(async () => 'en'), tSync: vi.fn(key => key) }));
vi.mock('../../scripts/translation/index.js', () => ({ translateMetadata: vi.fn(async text => text) }));
vi.mock('../../scripts/api/print-storage.js', () => ({ putPrintJob: vi.fn(async () => {}), removePrintJob: vi.fn(async () => {}), prunePrintJobs: vi.fn(async () => 0) }));
vi.mock('../../scripts/api/blob-download.js', () => ({ downloadBlob: vi.fn(async () => 1) }));
vi.mock('../../scripts/api/pdf-offscreen.js', () => ({ getPdfMetadata: vi.fn(async () => ({ numPages: 1 })) }));
vi.mock('../../scripts/api/tts.js', async original => ({ ...await original(), chunksToSpeech: vi.fn(async () => new ArrayBuffer(16)), getAudioExtension: vi.fn(() => 'wav') }));

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
beforeEach(async () => {
  vi.clearAllMocks();
  global.chrome.storage.local.get.mockResolvedValue({});
  global.chrome.storage.local.set.mockResolvedValue(undefined);
  global.chrome.storage.local.remove.mockResolvedValue(undefined);
  global.chrome.windows = { getCurrent: vi.fn(async () => ({ id: 1 })) };
  global.chrome.tabs.create = vi.fn(async () => ({ id: 12 }));
  global.chrome.tabs.remove = vi.fn(async () => {});
  global.chrome.debugger = { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({ data: 'JVBERi0xLjQ=', result: { value: { contentHeight: 1000, paperWidth: 8.27 } } })) };
  global.fetch = vi.fn(async () => ({ ok: true, text: async () => 'body { color: #111; }' }));
  putPrintJob.mockImplementation(async () => {});
  processImagesInBatches.mockImplementation(async () => []);
  translateMetadata.mockImplementation(async text => text);
  chunksToSpeech.mockImplementation(async () => new ArrayBuffer(16));
  await cancelProcessing(vi.fn());
  resetState();
});
afterEach(async () => { await cancelProcessing(vi.fn()); });

describe('document processing ownership', () => {
  it('carries the processing identity into Markdown across a delayed locale read', async () => {
    const pending = deferred();
    const oldRun = await beginRun();
    const reading = vi.fn(() => pending.promise);
    getUILanguage.mockImplementationOnce(reading);
    const generation = DocumentGeneratorFactory.generate('markdown', { processingRunId: oldRun, url: 'https://example.org/article', effectiveLanguage: 'fr', apiKey: 'sample-key' }, { ...result, publishDate: '2032-06-19' }, getScopedUpdateState(oldRun));
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(reading).toHaveBeenCalledOnce());
    const newRun = await replaceRun();
    pending.resolve('en');
    await outcome;
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(getProcessingRunId()).toBe(newRun);
    expect(getProcessingState().status).toBe('Current operation');
    expect(getProcessingState().progress).toBe(37);
  });

  it.each(['markdown', 'pdf'])('does not request metadata generation when exporting %s', async format => {
    const run = await beginRun(format);
    await DocumentGeneratorFactory.generate(format, { processingRunId: run, effectiveLanguage: 'fr', apiKey: 'synthetic-key' },
      { ...result, author: 'Sample Author', publishDate: '2032-06-19' }, getScopedUpdateState(run));
    expect(translateMetadata).not.toHaveBeenCalled();
    if (format === 'pdf') expect(putPrintJob.mock.calls[0][1].html).toContain('Sample Author');
  });

  it('localizes a partial publication date in the prepared PDF document', async () => {
    const run = await beginRun('pdf');
    await generatePdf({ ...result, processingRunId: run, publishDate: '2032-03', language: 'en' }, getScopedUpdateState(run));
    expect(putPrintJob.mock.calls[0][1].html).toContain('March 2032');
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
    expect(downloadBlob).not.toHaveBeenCalled();
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
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(getProcessingRunId()).toBe(newRun);
    expect(getProcessingState().progress).toBe(37);
  });

  it('keeps PDF preparation and cleanup isolated between overlapping operations', async () => {
    const pending = deferred();
    putPrintJob.mockReturnValueOnce(pending.promise);
    const oldRun = await beginRun('pdf');
    const oldGeneration = generatePdf({ ...result, processingRunId: oldRun }, getScopedUpdateState(oldRun));
    const outcome = expect(oldGeneration).rejects.toThrow();
    await vi.waitFor(() => expect(putPrintJob).toHaveBeenCalledOnce());
    const oldKey = putPrintJob.mock.calls[0][0];
    const newRun = await replaceRun();
    await expect(generatePdf({ ...result, processingRunId: newRun }, getScopedUpdateState(newRun))).resolves.toEqual({ success: true, deferred: true });
    const newKey = putPrintJob.mock.calls[1][0];
    expect(newKey).not.toBe(oldKey);
    expect(putPrintJob.mock.calls[1][1]).toMatchObject({ processingRunId: newRun, title: result.title });
    pending.resolve();
    await outcome;
    expect(removePrintJob).toHaveBeenCalledWith(oldKey);
    expect(removePrintJob).not.toHaveBeenCalledWith(newKey);
    expect(global.chrome.tabs.create).toHaveBeenCalledOnce();
    expect(global.chrome.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(global.chrome.tabs.create.mock.calls[0][0].url).toContain(`job=${newKey}`);
  });

  it('detaches an owned PDF debugger and rejects a stale print result', async () => {
    const pending = deferred();
    global.chrome.debugger.sendCommand.mockImplementation(async (_target, method) => method === 'Page.printToPDF' ? pending.promise : { result: { value: { contentHeight: 1000, paperWidth: 8.27 } } });
    const oldRun = await beginRun('pdf');
    const complete = vi.fn(), fail = vi.fn();
    const generation = generatePdfWithDebugger(12, 'Sample', 'multi', complete, fail, oldRun);
    const outcome = expect(generation).rejects.toThrow();
    await vi.waitFor(() => expect(global.chrome.debugger.sendCommand).toHaveBeenCalledWith(expect.anything(), 'Page.printToPDF', expect.anything()));
    await replaceRun();
    pending.resolve({ data: 'JVBERi0xLjQ=' });
    await outcome;
    expect(global.chrome.debugger.detach).toHaveBeenCalledOnce();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });

  it('does not detach another debugger when attach fails', async () => {
    global.chrome.debugger.attach.mockRejectedValueOnce(new Error('Debugger already attached'));
    await expect(generatePdfWithDebugger(12, 'Sample', 'multi', vi.fn(), vi.fn())).rejects.toThrow('Debugger already attached');
    expect(global.chrome.debugger.detach).not.toHaveBeenCalled();
  });

  it('measures print media before printing a naturally sized single page', async () => {
    const run = await beginRun('pdf');
    await generatePdfWithDebugger(12, 'Sample', 'single', vi.fn(), vi.fn(), run);
    const calls = chrome.debugger.sendCommand.mock.calls;
    const media = calls.findIndex(call => call[1] === 'Emulation.setEmulatedMedia');
    const measure = calls.findIndex(call => call[1] === 'Runtime.evaluate' && call[2].awaitPromise);
    const print = calls.findIndex(call => call[1] === 'Page.printToPDF');
    expect(media).toBeGreaterThanOrEqual(0);
    expect(measure).toBeGreaterThan(media);
    expect(print).toBeGreaterThan(measure);
    expect(calls[media][2]).toEqual({ media: 'print' });
    expect(calls[print][2]).toMatchObject({ paperWidth: 8.27, paperHeight: 1000 / 96, scale: 1 });
  });

  it('detaches and reports a failed print-layout measurement before downloading', async () => {
    const run = await beginRun('pdf');
    chrome.debugger.sendCommand.mockResolvedValue({ exceptionDetails: { text: 'Layout failed' } });
    await expect(generatePdfWithDebugger(12, 'Sample', 'single', vi.fn(), vi.fn(), run)).rejects.toThrow('prepare the PDF print layout');
    expect(chrome.debugger.detach).toHaveBeenCalledOnce();
    expect(chrome.debugger.sendCommand.mock.calls.some(call => call[1] === 'Page.printToPDF')).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('closes only the captured print job after debugger failure', async () => {
    const job = crypto.randomUUID();
    chrome.tabs.get.mockResolvedValue({ id: 12, url: `${chrome.runtime.getURL('print/print.html')}?job=${job}` });
    chrome.debugger.sendCommand.mockImplementation(async (_target, method) => {
      if (method === 'Page.printToPDF') throw new Error('Print failed');
      return { result: { value: { contentHeight: 1000 } } };
    });
    const run = await beginRun('pdf');
    await expect(generatePdfWithDebugger(12, 'Sample', 'multi', vi.fn(), vi.fn(), run)).rejects.toThrow('Print failed');
    expect(chrome.debugger.detach).toHaveBeenCalledOnce();
    expect(chrome.tabs.remove).toHaveBeenCalledWith(12);
  });

  it('hands off the original PDF bytes when the service worker cannot create object URLs', async () => {
    const create = URL.createObjectURL;
    URL.createObjectURL = undefined;
    try {
      const run = await beginRun('pdf');
      await generatePdfWithDebugger(12, 'Sample', 'multi', vi.fn(), vi.fn(), run);
      expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), 'Sample.pdf', run);
      expect(await downloadBlob.mock.calls[0][0].text()).toBe('%PDF-1.4');
    } finally { URL.createObjectURL = create; }
  });
});
