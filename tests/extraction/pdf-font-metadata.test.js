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

  it('recognizes the PostScript Times-Bold alias without treating medium italic faces as bold', () => {
    const names = new Map([
      ['g_d0_f1', { name: 'AAAAAA+NimbusRomNo9L-Medi' }],
      ['g_d0_f2', { name: 'AAAAAA+URWChanceryL-MediItal' }]
    ]);
    const output = extractFontNameMapping(textContent, 1, names);
    expect(output.get('g_d0_f1').fontWeight).toBe('bold');
    expect(output.get('g_d0_f2')).toMatchObject({ fontWeight: null, fontStyle: 'italic' });
  });

  it.each(['Regu', 'Regular', 'Roman', 'ReguItal'])('keeps a long ordinary %s run normal among short mathematical fragments', suffix => {
    const items = [
      { str: 'An ordinary paragraph continues across the complete width of the page.', fontName: 'text', transform: [10, 0, 0, 10, 10, 700], width: 430, height: 10 },
      ...Array.from({ length: 20 }, (_, index) => ({ str: 'x', fontName: 'math', transform: [7, 0, 0, 7, 10 + index * 8, 650], width: 3, height: 7 })),
      { str: 'Bold heading', fontName: 'bold', transform: [12, 0, 0, 12, 10, 600], width: 70, height: 12 },
      { str: 'Italic annotation', fontName: 'italic', transform: [10, 0, 0, 10, 10, 550], width: 70, height: 10 }
    ];
    const text = { items, styles: Object.fromEntries(['text', 'math', 'bold', 'italic'].map(name => [name, { fontFamily: 'serif' }])) };
    const fonts = new Map([
      ['text', { name: `SampleText-${suffix}` }], ['math', { name: 'SampleMath' }],
      ['bold', { name: 'SampleText-Bold' }], ['italic', { name: 'SampleText-Italic', fontWeight: 'normal' }]
    ]);
    const viewport = { width: 600, height: 800, convertToViewportPoint: (x, y) => [x, 800 - y] };
    const mapped = extractFontNameMapping(text, 1, fonts);
    expect(mapped.get('text').fontWeight).toBe('normal');
    const output = processPageItemsToLines(items, viewport, 1, { baseFontSize: 10 }, null, text, fonts).flatMap(line => line.items);
    expect(output.find(item => item.fontName === 'text')).toMatchObject({ isBold: false, isItalic: suffix === 'ReguItal' });
    expect(output.find(item => item.fontName === 'bold')).toMatchObject({ isBold: true });
    expect(output.find(item => item.fontName === 'italic')).toMatchObject({ isBold: false, isItalic: true });
  });
});
