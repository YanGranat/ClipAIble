import { describe, expect, it, vi } from 'vitest';
import { extractFontNameMapping } from '../../scripts/offscreen/pdf/utils/font-name-extractor.js';
import { processPageItemsToLines } from '../../scripts/offscreen/pdf/utils/item-transformer.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), criticalLog: vi.fn(), logToServiceWorker: vi.fn() }));

const textContent = {
  styles: { g_d0_f1: { fontFamily: 'sans-serif' }, g_d0_f2: { fontFamily: 'sans-serif' } },
  items: [
    { str: 'Header', fontName: 'g_d0_f1', transform: [12, 0, 0, 12, 10, 100], width: 36, height: 12 },
    { str: 'Detail', fontName: 'g_d0_f2', transform: [12, 0, 0, 12, 10, 70], width: 36, height: 12 }
  ]
};
const fontObjects = new Map([
  ['g_d0_f1', { name: 'AAAAAA+Arial-BoldMT', loadedName: 'g_d0_f1', fallbackName: 'sans-serif' }],
  ['g_d0_f2', { name: 'AAAAAA+ArialMT', loadedName: 'g_d0_f2', fallbackName: 'sans-serif' }]
]);

describe('PDF font metadata', () => {
  it('uses a resolved font name before the generic text-content family', () => {
    const mapping = extractFontNameMapping(textContent, 1, fontObjects);
    expect(mapping.get('g_d0_f1')).toMatchObject({ realFontName: 'AAAAAA+Arial-BoldMT', fontWeight: 'bold' });
    expect(mapping.get('g_d0_f2')).toMatchObject({ realFontName: 'AAAAAA+ArialMT', fontWeight: null });
  });

  it('carries resolved bold metadata into grouped text items', () => {
    const viewport = { width: 600, height: 800, convertToViewportPoint: (x, y) => [x, 800 - y] };
    const lines = processPageItemsToLines(textContent.items, viewport, 1, { baseFontSize: 12 }, null, textContent, fontObjects);
    const items = lines.flatMap(line => line.items);
    expect(items.find(item => item.str === 'Header')).toMatchObject({ realFontName: 'AAAAAA+Arial-BoldMT', isBold: true });
    expect(items.find(item => item.str === 'Detail')).toMatchObject({ realFontName: 'AAAAAA+ArialMT', isBold: false });
  });

  it('does not map an unresolved generic family to another font object', () => {
    const mapping = extractFontNameMapping({ styles: { Helvetica: { fontFamily: 'sans-serif' } } }, 1, fontObjects);
    expect(mapping.get('Helvetica')).toMatchObject({ realFontName: 'sans-serif', fontWeight: null });
  });
});
