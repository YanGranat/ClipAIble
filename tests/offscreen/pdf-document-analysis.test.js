import { beforeEach, expect, it, vi } from 'vitest';
const loader = vi.hoisted(() => ({ loadPdfDocument: vi.fn(), destroyPdfDocument: vi.fn(async () => {}) }));
vi.mock('../../scripts/offscreen/pdf/core/pdf-loader.js', () => loader);
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn(), logToServiceWorker: vi.fn() }));
import { extractPdfContent } from '../../scripts/offscreen/pdf/extract.js';
import { analyzePdfMetrics } from '../../scripts/offscreen/pdf/analyzers/metrics.js';

function fixture(failedPage) {
  const pages = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const item = (str, size, y) => ({ str, fontName: 'regular', width: 500, transform: [size, 0, 0, size, 50, 800 - y] });
    const page = {
      getViewport: () => ({ width: 600, height: 800, convertToViewportPoint: (x, y) => [x, 800 - y] }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }), cleanup: vi.fn(),
      getTextContent: vi.fn(async function () {
        expect(this).toBe(page);
        if (number === failedPage) throw new Error('Text decoding failed');
        return { styles: { regular: { fontFamily: 'Helvetica' } }, items: number <= 2
          ? [item(`Cover ${number}`, 36, 200), item('Document overview', 36, 260)]
          : [item('Running document name', 9, 20), ...Array.from({ length: 10 }, (_, line) => item(`Body page ${number} record ${line + 1} describes a measured relationship between components.`, 12, 100 + line * 18)), item(String(number), 9, 780)] };
      })
    };
    return page;
  });
  const pdf = { getPage: vi.fn(async number => pages[number - 1]) };
  loader.loadPdfDocument.mockResolvedValue({ pdf, numPages: pages.length, metadata: { title: 'Document study' }, outline: [] });
  return { pdf, pages };
}
beforeEach(() => vi.clearAllMocks());

it('uses body pages beyond two large-type covers and preserves their normal paragraph content', async () => {
  const { pdf, pages } = fixture();
  const progress = [];
  const result = await extractPdfContent('https://example.com/study.pdf', null, { onProgress: (current, total) => progress.push([current, total]) });
  expect(result.metrics.baseFontSize).toBe(12);
  const text = result.content.map(item => item.text || '').join(' ');
  expect(text).toContain('Body page 3 record 1');
  expect(text).toContain('Body page 12 record 10');
  expect(result.content.filter(item => item.type === 'heading').every(item => !item.text.startsWith('Body page'))).toBe(true);
  expect(text).not.toContain('Running document name');
  expect(result.content.some(item => /^\d+$/.test(item.text || ''))).toBe(false);
  expect(pdf.getPage).toHaveBeenCalledTimes(24);
  expect(pages.every(page => page.getTextContent.mock.calls.length === 2)).toBe(true);
  expect(progress).toEqual(Array.from({ length: 24 }, (_, index) => [index + 1, 24]));
  expect(loader.destroyPdfDocument).toHaveBeenCalledExactlyOnceWith(pdf);
});

it('does not disguise an unreadable page as an empty page', async () => {
  const { pdf } = fixture(7);
  await expect(extractPdfContent('https://example.com/study.pdf')).rejects.toMatchObject({ translationKey: 'errorPdfIncomplete', translationParams: { pages: '7' } });
  expect(loader.destroyPdfDocument).toHaveBeenCalledExactlyOnceWith(pdf);
});

it('measures visible text rather than the number of separately painted glyphs', () => {
  const text = 'Field notes record the previous measurement and the current value.';
  const smallLabels = Array.from({ length: 26 }, (_, index) =>
    ({ str: String(index % 10), fontSize: 7, y: 50 + index }));
  const single = [{ str: text, fontSize: 11.4, y: 90 }];
  const split = text.split(' ').map(str => ({ str, fontSize: 11.4, y: 90 }));
  for (const body of [single, split]) {
    expect(analyzePdfMetrics([...smallLabels, ...body], 1)).toMatchObject({ baseFontSize: 11.5, medianFontSize: 11.4 });
  }
});
