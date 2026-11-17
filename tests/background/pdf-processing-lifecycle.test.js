import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGeneratePdfDebugger, handlePrintJobFailed } from '../../scripts/message-handlers/processing.js';
import { handleProcessingResult } from '../../scripts/utils/pipeline-helpers.js';
import { cancelProcessing, getProcessingRunId, getProcessingState, resetState, startProcessing, updateState } from '../../scripts/state/processing.js';
import { generatePdfWithDebugger } from '../../scripts/generation/pdf.js';
import { recordSave } from '../../scripts/stats/index.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: (key) => key }));
vi.mock('../../scripts/generation/pdf.js', () => ({ generatePdfWithDebugger: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', async importOriginal => ({ ...(await importOriginal()), handleError: async (error) => error }));
vi.mock('../../scripts/stats/index.js', () => ({ recordSave: vi.fn() }));
vi.mock('../../scripts/translation/index.js', () => ({ detectContentLanguage: vi.fn(), generateSummary: vi.fn(), generateAbstract: vi.fn() }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => true }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn() }));

let runId;
let jobId;
const sender = { tab: { id: 21 } };
beforeEach(async () => {
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.storage.local.remove.mockReset().mockResolvedValue(undefined);
  generatePdfWithDebugger.mockReset().mockReturnValue(new Promise(() => {}));
  recordSave.mockReset().mockResolvedValue(undefined);
  await resetState();
  await startProcessing(vi.fn());
  runId = getProcessingRunId();
  jobId = crypto.randomUUID();
  updateState({ outputFormat: 'pdf', pdfPrintTabId: 21, pdfPrintJobId: jobId, progress: 95 });
});
afterEach(async () => { await resetState(); });

describe('PDF processing lifecycle', () => {
  it('keeps deferred PDF generation active until the debugger completion callback', async () => {
    const data = { processingRunId: runId, outputFormat: 'pdf', title: 'Article', url: 'https://example.com/' };
    await handleProcessingResult(data, { content: [] }, vi.fn(), { current: Date.now() }, async () => ({ deferred: true }));
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 95 });
    expect(recordSave).not.toHaveBeenCalled();
    handleGeneratePdfDebugger({ data: { ...data, sourceUrl: data.url } }, sender, vi.fn(), vi.fn());
    const complete = generatePdfWithDebugger.mock.calls[0][5];
    expect(getProcessingState().isProcessing).toBe(true);
    await complete();
    expect(getProcessingState()).toMatchObject({ isProcessing: false, progress: 100, status: 'statusDone' });
    expect(recordSave).toHaveBeenCalledTimes(1);
    expect(recordSave).toHaveBeenCalledWith(expect.objectContaining({ format: 'pdf', url: data.url }));
    handleGeneratePdfDebugger({ data }, sender, vi.fn(), vi.fn());
    expect(generatePdfWithDebugger).toHaveBeenCalledTimes(1);
  });

  it('allows cancellation while a PDF print tab is pending and ignores late completion', async () => {
    handleGeneratePdfDebugger({ data: { processingRunId: runId, title: 'Article' } }, sender, vi.fn(), vi.fn());
    const complete = generatePdfWithDebugger.mock.calls[0][5];
    await cancelProcessing(vi.fn());
    await startProcessing(vi.fn());
    updateState({ outputFormat: 'markdown', progress: 37 });
    await complete();
    expect(getProcessingState()).toMatchObject({ isProcessing: true, outputFormat: 'markdown', progress: 37 });
    expect(recordSave).not.toHaveBeenCalled();
  });

  it('admits one debugger request from the owned print tab', () => {
    const request = { data: { processingRunId: runId, title: 'Article' } };
    handleGeneratePdfDebugger(request, { tab: { id: 22 } }, vi.fn(), vi.fn());
    expect(generatePdfWithDebugger).not.toHaveBeenCalled();
    handleGeneratePdfDebugger(request, sender, vi.fn(), vi.fn());
    handleGeneratePdfDebugger(request, sender, vi.fn(), vi.fn());
    expect(generatePdfWithDebugger).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('reports a print preparation failure with a loaded run identity: %s', async (loaded) => {
    const respond = vi.fn();
    handlePrintJobFailed({ data: { printJobId: jobId, ...(loaded ? { processingRunId: runId } : {}), error: 'Print content unavailable' } }, sender, respond, vi.fn());
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(getProcessingState()).toMatchObject({ isProcessing: false, error: 'Print content unavailable' });
  });

  it('preserves the owned print error translation in processing state', async () => {
    const respond = vi.fn();
    handlePrintJobFailed({ data: { printJobId: jobId, processingRunId: runId, error: 'Print content unavailable', translationKey: 'errorPrintContentUnavailable', translationParams: {} } }, sender, respond, vi.fn());
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(getProcessingState()).toMatchObject({ isProcessing: false, error: 'Print content unavailable', errorTranslationKey: 'errorPrintContentUnavailable', errorTranslationParams: {} });
  });

  it.each(['old-job', 'other-tab', 'old-run'])('ignores a preparation failure from %s', async (kind) => {
    const data = { printJobId: kind === 'old-job' ? crypto.randomUUID() : jobId, processingRunId: kind === 'old-run' ? crypto.randomUUID() : runId, error: 'Stale failure', translationKey: 'errorNetwork', translationParams: {} };
    const previousTranslation = getProcessingState().errorTranslationKey;
    const respond = vi.fn();
    handlePrintJobFailed({ data }, kind === 'other-tab' ? { tab: { id: 22 } } : sender, respond, vi.fn());
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond).toHaveBeenCalledWith({ success: true, ignored: true });
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 95, error: null });
    expect(getProcessingState().errorTranslationKey).toBe(previousTranslation);
  });
});
