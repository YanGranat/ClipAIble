import { afterEach, expect, it, vi } from 'vitest';
import { loadPdfDocument } from '../../scripts/offscreen/pdf/core/pdf-loader.js';
import { renderPdfPage } from '../../scripts/offscreen/pdf/render-page.js';
import { recognizePdfPages } from '../../scripts/offscreen/pdf/ocr.js';

vi.mock('../../scripts/offscreen/pdf/core/pdf-loader.js', () => ({ loadPdfDocument: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/render-page.js', () => ({ renderPdfPage: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

function setup(recognize) {
  const controller = new AbortController();
  const { signal } = controller;
  const page = { cleanup: vi.fn() };
  const pdf = { getPage: vi.fn(async () => page) };
  const onProgress = vi.fn();
  const operation = { signal, check: () => signal.throwIfAborted(), adopt: vi.fn() };
  loadPdfDocument.mockResolvedValue({ pdf, numPages: 3, metadata: {} });
  renderPdfPage.mockImplementation(async (_page, number) => ({ blob: new Blob([new Uint8Array([number])]) }));
  const terminate = vi.fn();
  vi.stubGlobal('Worker', class extends EventTarget {
    terminate = terminate;
    postMessage({ jobId, action, payload }) {
      const data = action === 'recognize' ? recognize(payload.image[0], controller) : {};
      if (data === undefined) return;
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
        data: { jobId, action, status: 'resolve', data }
      })));
    }
  });
  return { result: recognizePdfPages('https://example.org/document.pdf', null, operation, onProgress),
    page, pdf, onProgress, terminate };
}

it('recognizes every page in order and skips emitting paragraphs for blank pages', async () => {
  const { result, page, pdf, onProgress, terminate } = setup(number => ({
    text: ['First page\ncontinued\n\nSecond paragraph', '', 'Last page'][number - 1]
  }));
  expect((await result).content.map(({ text, pageNum }) => [text, pageNum])).toEqual([
    ['First page continued', 1], ['Second paragraph', 1], ['Last page', 3]
  ]);
  expect(pdf.getPage.mock.calls).toEqual([[1], [2], [3]]);
  expect(onProgress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  expect(page.cleanup).toHaveBeenCalledTimes(3);
  expect(terminate).toHaveBeenCalledOnce();
});

it('stops the worker when cancelled during recognition and does not open later pages', async () => {
  const { result, page, pdf, onProgress, terminate } = setup((_, controller) => {
    controller.abort();
  });
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(pdf.getPage.mock.calls).toEqual([[1]]);
  expect(onProgress).not.toHaveBeenCalled();
  expect(page.cleanup).toHaveBeenCalledOnce();
  expect(terminate).toHaveBeenCalledOnce();
});
