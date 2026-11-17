import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/processors/page-processor.js', () => ({ processPage: vi.fn() }));
import { processPage } from '../../scripts/offscreen/pdf/processors/page-processor.js';
import { extractContentFromPages } from '../../scripts/offscreen/pdf/core/content-extractor.js';

const paragraph = { type: 'paragraph', text: 'Sample text.', pageNum: 1, minY: 40 };
beforeEach(() => vi.clearAllMocks());

describe('PDF page content conservation', () => {
  it('rejects a failed page after releasing both page objects', async () => {
    const pages = [{ cleanup: vi.fn() }, { cleanup: vi.fn() }];
    const pdf = { getPage: async number => pages[number - 1] };
    processPage.mockImplementation(async (_page, number) => {
      if (number === 2) throw new Error('Page content unavailable');
      return [{ ...paragraph }];
    });
    await expect(extractContentFromPages(pdf, 2, {})).rejects.toMatchObject({
      translationKey: 'errorPdfIncomplete', translationParams: { pages: '2' }
    });
    for (const page of pages) expect(page.cleanup).toHaveBeenCalledOnce();
  });

  it('preserves an explicitly blank page and all content from its neighboring page', async () => {
    const pages = [{ cleanup: vi.fn() }, { cleanup: vi.fn() }];
    const pdf = { getPage: async number => pages[number - 1] };
    processPage.mockImplementation(async (_page, number) => number === 2 ? [] : [{ ...paragraph }]);
    await expect(extractContentFromPages(pdf, 2, {})).resolves.toMatchObject({ elements: [paragraph], hasTextContent: true });
    for (const page of pages) expect(page.cleanup).toHaveBeenCalledOnce();
  });
});
