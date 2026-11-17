import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  loadPdfDocument: vi.fn(),
  destroyPdfDocument: vi.fn(async pdf => { if (pdf) await pdf.destroy(); }),
  extractContentFromPages: vi.fn()
}));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/core/pdf-loader.js', () => dependencies);
vi.mock('../../scripts/offscreen/pdf/core/metrics-collector.js', () => ({ collectSampleItems: async () => [] }));
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
    pdf = { destroy: vi.fn(async () => {}) };
    dependencies.loadPdfDocument.mockResolvedValue({ pdf, numPages: 1, metadata: {} });
    dependencies.extractContentFromPages.mockResolvedValue({ elements: [{ type: 'paragraph', text: 'Sample text' }] });
  });

  it('releases the document after extracting serialized content', async () => {
    await expect(extractPdfContent('https://example.com/document.pdf')).resolves.toEqual(expect.objectContaining({
      title: 'Sample document', content: [{ type: 'paragraph', text: 'Sample text' }]
    }));
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('releases the document after extraction fails', async () => {
    dependencies.extractContentFromPages.mockRejectedValue(new Error('Extraction failed'));
    await expect(extractPdfContent('https://example.com/document.pdf')).rejects.toThrow('Extraction failed');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });
});
