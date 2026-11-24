import { describe, expect, it, vi } from 'vitest';
import { detectPreliminaryColumns } from '../../scripts/offscreen/pdf/analyzers/preliminary-column-detector.js';
import { analyzeVisualStructure } from '../../scripts/offscreen/pdf/analyzers/visual-structure-analyzer.js';
import { classifyHeading } from '../../scripts/offscreen/pdf/classifiers/heading.js';
import { detectColumns, processLinesByColumns } from '../../scripts/offscreen/pdf/analyzers/column-detector.js';
import { processPageItemsToLines } from '../../scripts/offscreen/pdf/utils/item-transformer.js';
import { groupLinesIntoElements } from '../../scripts/offscreen/pdf/processors/element-grouper.js';
import { extractNumberingLevel } from '../../scripts/offscreen/pdf/analyzers/heading-hierarchy.js';
import { findRunningMargins } from '../../scripts/offscreen/pdf/analyzers/running-margins.js';
import { classifyList } from '../../scripts/offscreen/pdf/classifiers/list.js';
import { mergeCrossPageParagraphs } from '../../scripts/offscreen/pdf/processors/cross-page.js';
import { CROSS_PAGE_BREAK_MARKER } from '../../scripts/offscreen/pdf/constants.js';

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn(), logToServiceWorker: vi.fn()
}));

const viewport = { width: 600, height: 800 };
const metrics = { baseFontSize: 12 };
const columnItems = () => [
  ...Array.from({ length: 60 }, (_, index) => ({
    x: 50 + Math.floor(index / 3), y: 50 + index * 10, width: 180
  })),
  ...Array.from({ length: 20 }, (_, index) => ({ x: 300, y: 50 + index * 10, width: 180 }))
];

describe('PDF layout boundaries', () => {
  it('keeps hanging indents in one reading column when their horizontal extents overlap', () => {
    const lines = Array.from({ length: 12 }, (_, index) => {
      const x = index % 3 === 0 ? 50 : 85;
      return { x, y: 50 + index * 12, text: `Reference record ${index}`, items: [{ x, width: 480 - x }] };
    });
    expect(detectColumns(lines, viewport, metrics)).toEqual([]);
  });

  it('retains real disjoint reading columns', () => {
    const lines = Array.from({ length: 8 }, (_, index) => [50, 330].map(x => ({ x, y: 50 + index * 12,
      text: `Column record ${x} ${index}`, items: [{ x, width: 200 }] }))).flat();
    expect(detectColumns(lines, viewport, metrics)).toHaveLength(2);
  });

  it('retains two reading columns with full-width text above and below their shared body', () => {
    const lines = Array.from({ length: 8 }, (_, index) => [50, 330].map(x => ({ x, y: 80 + index * 12,
      text: `Column record ${x} ${index}`, items: [{ x, width: 200 }] }))).flat();
    lines.unshift({ x: 50, y: 20, text: 'Survey overview', items: [{ x: 50, width: 480 }] });
    lines.push({ x: 50, y: 220, text: 'Figure description across both regions.', items: [{ x: 50, width: 480 }] });
    const columns = detectColumns(lines, viewport, metrics);
    expect(columns).toHaveLength(2);
    expect(columns[0].maxX).toBeLessThan(columns[1].x);
    const owned = columns.flatMap(column => column.lines);
    expect(owned).toHaveLength(lines.length);
    expect(new Set(owned)).toEqual(new Set(lines));
  });
  it('retains the rightmost column when its start falls on a histogram boundary', () => {
    const columns = detectPreliminaryColumns(columnItems(), viewport, metrics);
    expect(columns).toHaveLength(2);
    expect(columns[0].x).toBe(50);
    expect(columns[1].maxX).toBe(480);
    expect(columns.every(column => column.width > 0)).toBe(true);
  });

  it('preserves original item references when ignoring negative coordinates', () => {
    const items = columnItems();
    const expected = detectPreliminaryColumns(items, viewport, metrics);
    const actual = detectPreliminaryColumns([{ x: -100, y: 20, width: 1 }, ...items], viewport, metrics);
    expect(actual).toEqual(expected);
  });

  it('does not create a separator where text spans the gap between start positions', () => {
    const items = columnItems().map(item => ({ ...item, width: 400 }));
    expect(detectPreliminaryColumns(items, viewport, metrics)).toEqual([]);
  });

  it('clips coverage to the page when text starts outside the left edge', () => {
    const result = analyzeVisualStructure([
      { x: -10, y: 50, text: 'Clipped text', items: [{ x: -10, width: 120 }] }
    ], viewport, metrics);
    expect(result.verticalStrips[0].lineCount).toBe(1);
  });

  it('recognizes a numbered section with a larger font', () => {
    expect(classifyHeading({ text: '1. Introduction', fontSize: 18, isBold: true }, metrics).type).toBe('heading');
  });

  it('keeps ordinary numbered items and explicit lists out of headings', () => {
    expect(classifyHeading({ text: '1. First item', fontSize: 12 }, metrics).type).toBe('not-heading');
    expect(classifyHeading({ type: 'list', text: '1. First item', fontSize: 18, isBold: true }, metrics).type).toBe('not-heading');
  });

  it('reads fragments from left to right on the same baseline without collapsing nearby distinct baselines', () => {
    const span = (str, x, y) => ({ str, transform: [12, 0, 0, 12, x, y], width: 48, height: 12 });
    const projection = { ...viewport, convertToViewportPoint: (x, y) => [x, y] };
    const lines = processPageItemsToLines([
      span('Right fragment', 220, 119.9999999999999),
      span('Left fragment', 30, 120.0000000000001),
      span('Next baseline', 405, 120.025)
    ], projection, 1, metrics);
    expect(lines.map(line => line.text)).toEqual(['Left fragment', 'Right fragment', 'Next baseline']);
    expect(lines[0].y).toBe(lines[1].y);
    expect(lines[0].y).toBeCloseTo(120);
    expect(lines[2].y).toBe(120.025);
  });

  it('keeps an equally sized bold subsection separate from body text and assigns its dotted depth', () => {
    const line = (text, x, y, isBold = false) => ({ text, x, y, isBold, pageNum: 1, fontSize: 12, items: [{ x, y, width: text.length * 4, fontSize: 12 }] });
    const elements = groupLinesIntoElements([
      line('The environment remains stable while the experiment is underway.', 45, 20),
      line('All observations were preserved in the primary record.', 45, 34),
      line('2.4.1', 45, 57, true), line('Calibration sequence', 80, 57, true),
      line('Calibration starts by confirming that the reference is settled.', 45, 79),
      line('2.5 percent remains inside the stated uncertainty.', 45, 94)
    ], metrics);
    expect(elements.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['2.4.1 Calibration sequence']);
    expect(elements.find(item => item.text.includes('primary record.'))).toMatchObject({ type: 'paragraph' });
    expect(elements.find(item => item.text.includes('2.5 percent'))).toMatchObject({ type: 'paragraph' });
    expect(extractNumberingLevel('2.4.1 Calibration sequence')).toEqual({ level: 4, depth: 3 });
  });

  it('recognizes an isolated same-size bold dotted section', () => {
    const number = { text: '2.4.1', y: 132, isBold: true };
    const name = { text: 'Thermal drift', y: 132, isBold: true };
    const field = { text: '2.4.1 Thermal drift', fontSize: 12, isBold: true, gapAfter: 13, lines: [number, name] };
    expect(classifyHeading(field, metrics).type).toBe('heading');
    expect(classifyHeading({ ...field, type: 'list' }, metrics).type).toBe('not-heading');
  });

  it('filters repeated body-size folios while retaining isolated values and nearby body rows', () => {
    const line = (pageNum, text, y) => ({ pageNum, text, y, fontSize: 12, items: [{ viewportHeight: 800 }] });
    const lines = [1, 2, 3, 4, 5].flatMap(pageNum => [
      line(pageNum, 'Final record on the page.', pageNum === 4 ? 738 : 713),
      line(pageNum, String(pageNum === 5 ? 42 : pageNum), 756)
    ]);
    const numbers = findRunningMargins(lines, 5, 12);
    expect(numbers.map(line => line.text)).toEqual(['1', '2', '3']);
  });

  it('distinguishes a figure caption with a hyphen from a bulleted line', () => {
    expect(classifyList({ text: 'Figure 7: Survey results - comparison of values.' }).type).toBe('not-list');
    expect(classifyList({ text: '- Comparison of values.' }).type).toBe('list');
  });

  it('keeps a figure caption independent at a page break that joins ordinary continuations', () => {
    const previous = { type: 'paragraph', pageNum: 1, gapAfter: CROSS_PAGE_BREAK_MARKER,
      text: 'The completed reference measurements establish a reliable starting point for the repeated multi-' };
    const continued = { type: 'paragraph', pageNum: 2, text: 'phase sequence.' };
    const figure = { type: 'paragraph', pageNum: 2, text: 'Figure 7: Survey results - comparison of values.' };

    expect(mergeCrossPageParagraphs([previous, continued], metrics).map(item => item.text))
      .toEqual(['The completed reference measurements establish a reliable starting point for the repeated multi-phase sequence.']);
    expect(mergeCrossPageParagraphs([previous, figure], metrics)).toEqual([previous, figure]);
  });

  it.each([1, 2])('does not silently return partial content when reading lane %s fails', failingLane => {
    const lines = Array.from({ length: 8 }, (_, index) => [50, 330].map(x => ({
      x, y: 50 + index * 12, text: `Column record ${x} ${index}`, items: [{ x, width: 200 }]
    }))).flat();
    const failure = new Error('Invalid paragraph geometry');
    let lane = 0;
    const classify = input => {
      if (++lane === failingLane) throw failure;
      return input;
    };
    expect(() => processLinesByColumns(failingLane === 1 ? lines.filter(line => line.x === 50) : lines,
      viewport, metrics, classify)).toThrow(failure);
  });

  it('retains a reading region with several fragments on its only baseline', () => {
    const group = (text, x) => ({ text, x, y: 106, pageNum: 1, fontSize: 12, items: [{ x, y: 106, width: 37, fontSize: 12 }] });
    const elements = groupLinesIntoElements([group('Specimen', 50), group('reference', 104)], metrics);
    expect(elements.map(item => item.text).join(' ')).toBe('Specimen reference');
  });
});
