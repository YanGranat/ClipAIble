import { expect, it, vi } from 'vitest';
import { handleExtractPdf } from '../../scripts/offscreen/message-handlers.js';
import { extractPdfContent } from '../../scripts/offscreen/pdf/extract.js';
vi.mock('../../scripts/offscreen/pdf/extract.js', () => ({ extractPdfContent: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
it('sends document content and real progress without copying analysis metrics into IPC', async () => {
  const content = [{ type: 'paragraph', text: 'Sample body.', lines: [{ items: [{ str: 'Sample body.' }] }] }];
  const metrics = { graphics: { page: ['analysis-only'] } };
  extractPdfContent.mockImplementation(async (_url, _bytes, options) => {
    options.onProgress(1, 2); options.onProgress(2, 2);
    return { title: 'Sample document', content, metrics };
  });
  chrome.runtime.sendMessage.mockImplementation(async () => ({}));
  const reply = vi.fn();
  await handleExtractPdf('request', { operationId: 'sample-operation', pdfUrl: 'https://example.org/file.pdf' }, reply);
  expect(reply).toHaveBeenCalledExactlyOnceWith({ success: true, result: { title: 'Sample document', content } });
  expect(chrome.runtime.sendMessage.mock.calls.map(([message]) => [message.data.current, message.data.total]))
    .toEqual([[1, 2], [2, 2]]);
});
