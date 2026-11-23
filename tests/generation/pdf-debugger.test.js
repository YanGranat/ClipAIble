import { beforeEach, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../scripts/api/blob-download.js';
import { generatePdfWithDebugger } from '../../scripts/generation/pdf.js';
import { isCancelled } from '../../scripts/state/processing.js';

vi.mock('../../scripts/api/blob-download.js', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../scripts/state/processing.js', async load => ({ ...(await load()), isCancelled: vi.fn() }));

const runId = 'test-run';
const pdfBytes = '%PDF-1.7\n%%EOF\n';

beforeEach(() => {
  vi.clearAllMocks();
  isCancelled.mockReturnValue(false);
  chrome.debugger.sendCommand.mockImplementation(async (_, method) => {
    if (method === 'Runtime.evaluate') return { result: { value: { contentHeight: 1200 } } };
    if (method === 'Page.printToPDF') return { data: btoa(pdfBytes) };
    return {};
  });
});

it('prints the measured DOM and reports completion only after the shared download terminates', async () => {
  let finishDownload;
  downloadBlob.mockImplementationOnce(() => new Promise(resolve => { finishDownload = resolve; }));
  const complete = vi.fn();
  const setError = vi.fn();
  const job = generatePdfWithDebugger(1, 'Research notes', 'single', complete, setError, runId);
  await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(complete).not.toHaveBeenCalled();
  const [[blob, name, owner]] = downloadBlob.mock.calls;
  expect([await blob.text(), blob.type, name, owner]).toEqual([pdfBytes, 'application/pdf', 'Research_notes.pdf', runId]);
  expect(chrome.debugger.sendCommand.mock.calls.map(([, method]) => method)).toEqual([
    'Emulation.setEmulatedMedia', 'Runtime.evaluate', 'Page.printToPDF'
  ]);
  finishDownload(12);
  await expect(job).resolves.toMatchObject({ success: true });
  expect(complete).toHaveBeenCalledOnce();
  expect(setError).not.toHaveBeenCalled();
});

it('reports an interrupted save as an error instead of completing the run', async () => {
  const failed = Object.assign(new Error('Download interrupted'), { code: 'DOWNLOAD_INTERRUPTED' });
  downloadBlob.mockRejectedValueOnce(failed);
  const complete = vi.fn(), setError = vi.fn();
  await expect(generatePdfWithDebugger(1, 'Research notes', 'multi', complete, setError, runId)).rejects.toBe(failed);
  expect(complete).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Download interrupted' }));
});

it('uses A4 when the prepared single-page document exceeds the PDF page limit', async () => {
  chrome.debugger.sendCommand.mockImplementation(async (_, method) => {
    if (method === 'Runtime.evaluate') return { result: { value: { contentHeight: 24000, pageMode: 'multi' } } };
    if (method === 'Page.printToPDF') return { data: btoa(pdfBytes) };
    return {};
  });
  downloadBlob.mockResolvedValueOnce(12);
  const complete = vi.fn();
  await generatePdfWithDebugger(1, 'Research notes', 'single', complete, vi.fn(), runId);
  expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 1 }, 'Page.printToPDF',
    expect.objectContaining({ paperWidth: 8.27, paperHeight: 11.69, scale: 1 }));
  expect(complete).toHaveBeenCalledOnce();
});

it('does not download or complete a run after Chromium returns no PDF payload', async () => {
  chrome.debugger.sendCommand.mockImplementation(async (_, method) =>
    method === 'Runtime.evaluate' ? { result: { value: { contentHeight: 1200 } } } : {});
  const complete = vi.fn(), setError = vi.fn();
  await expect(generatePdfWithDebugger(1, 'Research notes', 'multi', complete, setError, runId))
    .rejects.toMatchObject({ translationKey: 'errorPdfGenerationFailed' });
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledOnce();
});

it('does not change a newer run when the owned PDF download is cancelled', async () => {
  let cancelDownload;
  downloadBlob.mockImplementationOnce(() => new Promise((_, reject) => { cancelDownload = reject; }));
  const complete = vi.fn(), setError = vi.fn();
  const job = generatePdfWithDebugger(1, 'Research notes', 'multi', complete, setError, runId);
  await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  const cancellation = new DOMException('Cancelled', 'AbortError');
  isCancelled.mockReturnValue(true);
  cancelDownload(cancellation);
  await expect(job).rejects.toBe(cancellation);
  expect(complete).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
});
