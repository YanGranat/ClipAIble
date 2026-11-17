import { describe, expect, it } from 'vitest';
import { classifyTable } from '../../scripts/offscreen/pdf/classifiers/table.js';
import { groupLinesIntoElements } from '../../scripts/offscreen/pdf/processors/element-grouper.js';
import { mergeColumnElementsIntoTables } from '../../scripts/offscreen/pdf/processors/table-column-merger.js';

const metrics = { baseFontSize: 10, baseFontName: 'Helvetica', paragraphGapThreshold: 20, lineHeight: 10, pageWidth: 600, pageHeight: 800 };

function line(items, row) {
  return { items, text: items.map(item => item.text).join(' '), x: 40, y: 100 + row * 20,
    minX: 40, maxX: 580, minY: 100 + row * 20, maxY: 110 + row * 20,
    fontSize: 10, height: 10, pageNum: 1, columnIndex: 0 };
}

describe('PDF table classification priority', () => {
  it('preserves a long borderless table through grouping and merging', () => {
    const lines = Array.from({ length: 5 }, (_, row) => line([40, 230, 420].map((x, column) => ({
      text: `Sample entry at row ${row + 1} column ${column + 1}.`, x, y: 100 + row * 20,
      width: 160, height: 10, fontSize: 10, fontName: 'Helvetica', isBold: false
    })), row));
    const text = lines.map(item => item.text).join(' ');
    expect(text.length).toBeGreaterThan(300);
    expect(classifyTable({ lines, text }, { metrics })).toEqual(expect.objectContaining({
      type: 'table', confidence: expect.any(Number)
    }));
    const grouped = groupLinesIntoElements(lines, metrics);
    const result = mergeColumnElementsIntoTables(grouped, metrics);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('table');
    expect(result[0].lines.map(item => item.text).join(' ')).toBe(text);
  });

  it('preserves long prose with one text column as a paragraph', () => {
    const lines = Array.from({ length: 5 }, (_, row) => line([{
      text: `Paragraph line ${row + 1} explains a continuous discussion with ordinary prose and supporting details.`,
      x: 40, y: 100 + row * 20, width: 500, height: 10, fontSize: 10, fontName: 'Helvetica', isBold: false
    }], row));
    const text = lines.map(item => item.text).join(' ');
    expect(text.length).toBeGreaterThan(300);
    const result = mergeColumnElementsIntoTables(groupLinesIntoElements(lines, metrics), metrics);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('paragraph');
    expect(result[0].lines.map(item => item.text).join(' ')).toBe(text);
  });
});
