import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/utils/item-transformer.js', () => ({ processPageItemsToLines: vi.fn(() => []) }));
vi.mock('../../scripts/offscreen/pdf/utils/graphics-extractor.js', () => ({ extractPageGraphics: vi.fn(), detectTableRegionsFromGraphics: vi.fn(() => []) }));

import { processPage } from '../../scripts/offscreen/pdf/processors/page-processor.js';
import { processPageItemsToLines } from '../../scripts/offscreen/pdf/utils/item-transformer.js';
import { extractPageGraphics } from '../../scripts/offscreen/pdf/utils/graphics-extractor.js';

describe('PDF page font data', () => {
  it('passes the page font objects after operator loading completes', async () => {
    let finishOperators;
    extractPageGraphics.mockImplementationOnce(() => new Promise(resolve => { finishOperators = resolve; }));
    const commonObjs = { get: vi.fn() };
    const text = { items: [{ str: 'A heading', fontName: 'g_d0_f1' }], styles: {} };
    const viewport = { width: 600, height: 800 };
    const page = { commonObjs, getViewport: () => viewport, getTextContent: async () => text };
    const metrics = { baseFontSize: 12 };
    const pending = processPage(page, 1, metrics);
    await Promise.resolve();
    expect(processPageItemsToLines).not.toHaveBeenCalled();
    const graphics = { lines: [], rectangles: [] };
    finishOperators(graphics);
    await expect(pending).resolves.toEqual([]);
    expect(processPageItemsToLines).toHaveBeenCalledWith(text.items, viewport, 1, metrics, graphics, text, commonObjs);
    expect(processPageItemsToLines.mock.calls[0][6]).toBe(commonObjs);
  });
});
