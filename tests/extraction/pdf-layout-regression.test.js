import { describe, expect, it, vi } from 'vitest';
import { detectPreliminaryColumns } from '../../scripts/offscreen/pdf/analyzers/preliminary-column-detector.js';
import { analyzeVisualStructure } from '../../scripts/offscreen/pdf/analyzers/visual-structure-analyzer.js';
import { classifyHeading } from '../../scripts/offscreen/pdf/classifiers/heading.js';
import { detectColumns } from '../../scripts/offscreen/pdf/analyzers/column-detector.js';

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn()
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
});
