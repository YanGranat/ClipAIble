import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  loadPdfDocument: vi.fn(),
  destroyPdfDocument: vi.fn(async () => {}),
  extractContentFromPages: vi.fn()
}));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/core/pdf-loader.js', () => dependencies);
vi.mock('../../scripts/offscreen/pdf/core/gap-analysis-collector.js', () => ({ collectAllLinesForGapAnalysis: async () => [] }));
vi.mock('../../scripts/offscreen/pdf/core/content-extractor.js', () => ({ extractContentFromPages: dependencies.extractContentFromPages }));
vi.mock('../../scripts/offscreen/pdf/core/content-processor.js', () => ({ processContent: elements => ({ title: 'Sample document', elements }) }));
vi.mock('../../scripts/offscreen/pdf/analyzers/metrics.js', () => ({ analyzePdfMetrics: () => ({}) }));
vi.mock('../../scripts/offscreen/pdf/analyzers/gap-analyzer.js', () => ({ analyzeGaps: () => ({}) }));

import { extractPdfContent } from '../../scripts/offscreen/pdf/extract.js';

describe('PDF extraction lifecycle', () => {
  let pdf;
  beforeEach(() => {
    vi.clearAllMocks();
    pdf = {};
    dependencies.loadPdfDocument.mockResolvedValue({ pdf, numPages: 1, metadata: {} });
    dependencies.extractContentFromPages.mockResolvedValue({ elements: [{ type: 'paragraph', text: 'Sample text' }] });
  });

  it('releases the document after extracting serialized content', async () => {
    await expect(extractPdfContent('https://example.com/document.pdf')).resolves.toEqual(expect.objectContaining({
      title: 'Sample document', content: [{ type: 'paragraph', text: 'Sample text' }]
    }));
    expect(dependencies.destroyPdfDocument).toHaveBeenCalledExactlyOnceWith(pdf);
  });

  it('releases the document after extraction fails', async () => {
    dependencies.extractContentFromPages.mockRejectedValue(new Error('Extraction failed'));
    await expect(extractPdfContent('https://example.com/document.pdf')).rejects.toThrow('Extraction failed');
    expect(dependencies.destroyPdfDocument).toHaveBeenCalledExactlyOnceWith(pdf);
  });

  it('passes acquired bytes and ownership into the document loader', async () => {
    const input = new TextEncoder().encode('%PDF-1.7\n').buffer, controller = new AbortController();
    await extractPdfContent('file:///document.pdf', input, { signal: controller.signal });
    expect(dependencies.loadPdfDocument).toHaveBeenCalledWith('file:///document.pdf', input, { signal: controller.signal });
  });

  it('disposes an owner whose extraction phase stalls and never publishes its late content', async () => {
    let resolve;
    dependencies.extractContentFromPages.mockReturnValue(new Promise(finish => { resolve = finish; }));
    const controller = new AbortController(), reason = new Error('Owner cancelled');
    const pending = extractPdfContent('file:///document.pdf', null, { signal: controller.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.waitFor(() => expect(dependencies.extractContentFromPages).toHaveBeenCalledOnce());
    let settled = false;
    pending.catch(() => { settled = true; });
    controller.abort(reason);
    await new Promise(setImmediate);
    expect(settled).toBe(true);
    await rejected;
    expect(dependencies.destroyPdfDocument).toHaveBeenCalledWith(pdf);
    resolve({ elements: [{ type: 'paragraph', text: 'Late content' }] });
    await Promise.resolve(); await rejected;
  });
});
