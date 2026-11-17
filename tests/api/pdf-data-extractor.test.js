import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPdfDataFromTab } from '../../scripts/api/pdf-data-extractor.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), criticalLog: vi.fn() }));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('document', { readyState: 'complete', querySelector: () => null, querySelectorAll: () => [] });
  chrome.scripting.executeScript.mockImplementation(async ({ func, args }) => [{ result: await func(...args) }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('PDF file data extraction', () => {
  it.each(['getData', 'saveDocument'])('returns only the bytes represented by the %s typed array', async (method) => {
    const backing = new Uint8Array([91, 92, 0, 255, 5, 93]);
    const data = new Uint8Array(backing.buffer, 2, 3);
    const pdfDocument = { [method]: vi.fn().mockResolvedValue(data) };
    vi.stubGlobal('window', {
      location: { href: 'https://example.com/document.pdf', protocol: 'https:', hostname: 'example.com' },
      PDFViewerApplication: { pdfDocument }
    });
    const result = await extractPdfDataFromTab('https://example.com/document.pdf', 21);
    expect([...new Uint8Array(result)]).toEqual([0, 255, 5]);
    expect(pdfDocument[method]).toHaveBeenCalledTimes(1);
  });
});
