import { expect, it, vi } from 'vitest';
import { transformTextItems } from '../../scripts/offscreen/pdf/utils/item-transformer.js';
import { buildFontFormatMap, detectUnderlinedText } from '../../scripts/offscreen/pdf/utils/font-detection.js';
import { findRunningMargins, isRunningMargin } from '../../scripts/offscreen/pdf/analyzers/running-margins.js';
import { joinPdfText } from '../../scripts/offscreen/pdf/utils/text-join.js';
import { shouldMergeParagraphs, mergeCrossPageParagraphs } from '../../scripts/offscreen/pdf/processors/cross-page.js';
import { CROSS_PAGE_BREAK_MARKER } from '../../scripts/offscreen/pdf/constants.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn(), logToServiceWorker: vi.fn() }));

it('does not infer bold from the length of a regular text run', () => {
  const items = transformTextItems([...Array.from({ length: 30 }, () => ({ str: 'Body', width: 24, fontName: 'body', transform: [12, 0, 0, 12, 50, 100] })),
    { str: 'A longer regular label', width: 600, fontName: 'label', transform: [12, 0, 0, 12, 50, 200] }], { height: 800, convertToViewportPoint: (x, y) => [x, 800 - y] }, 1);
  const map = buildFontFormatMap(items, new Map([['body', 'Helvetica'], ['label', 'Helvetica-Regular']]));
  expect(map.has('label')).toBe(false);
  const bold = buildFontFormatMap(items, new Map([['body', 'Helvetica'], ['label', 'Helvetica-Bold']]));
  expect(bold.get('label')).toBe('bold');
});

it('preserves explicit italic and painted underline independently of font width', () => {
  expect(buildFontFormatMap([{ fontName: 'italic', widthHeightRatio: 1 }], new Map([['italic', 'Helvetica-Oblique']])).get('italic')).toBe('italic');
  const items = [{ str: 'Example label', x: 20, y: 100, width: 40, fontSize: 12 }];
  detectUnderlinedText(items, { allLines: [{ x1: 20, x2: 40, y1: 101, y2: 101 }] });
  expect(items[0].underlinedRanges).toEqual([expect.objectContaining({ startIndex: 0, endIndex: 7 })]);
});

it('removes only repeated isolated small-print margins, preserving body titles and table data', () => {
  const line = (pageNum, text, y, fontSize = 12) => ({ pageNum, text, y, fontSize, items: [{ fontSize, viewportHeight: 800 }] });
  const lines = [1, 2, 3, 4].flatMap(page => [line(page, 'Running document name', 20, 9), line(page, 'Methods', 90), line(page, 'Body data', 300), line(page, String(page), 780, 9)]);
  const margins = findRunningMargins(lines, 4, 12);
  expect(margins).toHaveLength(8);
  expect(isRunningMargin({ type: 'paragraph', pageNum: 2, text: '2', lines: [{ y: 780 }] }, margins)).toBe(true);
  expect(isRunningMargin({ type: 'table', pageNum: 2, text: '2', lines: [{ y: 780 }] }, margins)).toBe(false);
  expect(isRunningMargin({ type: 'heading', pageNum: 2, text: 'Methods', lines: [{ y: 90 }] }, margins)).toBe(false);
  expect(findRunningMargins(lines.slice(0, 2), 1, 12)).toEqual([]);
});

it('joins wrapped words without erasing a printed compound hyphen', () => {
  expect(joinPdfText('infor-', 'mation')).toBe('infor-mation');
  expect(joinPdfText('well-', 'known')).toBe('well-known');
  expect(joinPdfText('infor\u00ad', 'mation')).toBe('information');
  expect(joinPdfText('Equation -', '3')).toBe('Equation - 3');
});

it('continues only adjacent reading-flow paragraphs across columns and pages', () => {
  const previous = { type: 'paragraph', text: 'This paragraph continues with information about the underlying system,', pageNum: 1, columnIndex: 0, fontSize: 12, gapAfter: CROSS_PAGE_BREAK_MARKER };
  const current = { type: 'paragraph', text: 'and its remaining details appear in the next column for the reader.', pageNum: 1, columnIndex: 1, fontSize: 12 };
  expect(shouldMergeParagraphs(previous, current, { baseFontSize: 12 })).toBe(true);
  expect(mergeCrossPageParagraphs([previous, current], { baseFontSize: 12 })).toHaveLength(1);
  expect(shouldMergeParagraphs({ ...previous, gapAfter: 30 }, current, { baseFontSize: 12 })).toBe(false);
  expect(shouldMergeParagraphs(previous, { ...current, text: 'A separate sentence.', fontSize: 24 }, { baseFontSize: 12 })).toBe(false);
  expect(shouldMergeParagraphs({ ...previous, columnIndex: 1 }, { ...current, pageNum: 2, columnIndex: 0 }, { baseFontSize: 12 })).toBe(true);
});
