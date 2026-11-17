import { describe, expect, it } from 'vitest';
import { groupLinesIntoElements } from '../../scripts/offscreen/pdf/processors/element-grouper.js';
import { mergeColumnElementsIntoTables } from '../../scripts/offscreen/pdf/processors/table-column-merger.js';
import { checkGraphicsInElementArea } from '../../scripts/offscreen/pdf/utils/graphics-extractor.js';

const line = (text, x, y, isBold) => ({ text, x, y, fontSize: 11, fontName: isBold ? 'Helvetica-Bold' : 'Helvetica',
  isBold, pageNum: 1, height: 11, minX: x, maxX: x + 80, minY: y, maxY: y + 11 });
const column = (lines, index, type) => ({ type, columnIndex: index, pageNum: 1, lines,
  text: lines.map(item => item.text).join(' '), minY: lines[0].y, maxY: lines.at(-1).y });
const graphics = {
  lines: [91.5, 108.5, 125.5, 142.5].map(y => ({ x1: 50, x2: 400, y1: y, y2: y, lineWidth: 0.5 })),
  rectangles: [{ x: 50, y: 91.5, width: 150, height: 17 }, { x: 200, y: 91.5, width: 200, height: 17 }]
};
const metrics = { baseFontSize: 11, baseFontName: 'Helvetica', paragraphGapThreshold: 20, lineHeight: 17,
  gapAnalysis: { normalGapMax: 23, paragraphGapMin: 34, mean: 18 },
  pageWidth: 600, pageHeight: 800, graphicsData: { 1: graphics } };
const left = [line('Feature', 60, 100, true), line('First', 60, 117, true), line('Second', 60, 134, true)];
const right = [line('Measure', 230, 100, true), line('14', 230, 117, false), line('29', 230, 134, false)];
const visibleText = elements => elements.map(element => element.type === 'table'
  ? element.rows.flat().join(' ') : element.text || '').join(' ');

describe('PDF table residual content', () => {
  it('preserves a heading line outside the table when its column block also contains table cells', () => {
    const section = line('Section overview', 60, 83, true);
    const grouped = groupLinesIntoElements([section, ...left], { ...metrics, columnIndex: 0 });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe('heading');
    const elements = [...grouped.map(element => ({ ...element, columnIndex: 0 })), column(right, 1, 'paragraph')];
    const original = structuredClone(elements);
    const originalMetrics = structuredClone(metrics);
    const result = mergeColumnElementsIntoTables(elements, metrics);
    expect(result.filter(element => element.type === 'table').map(element => element.rows)).toEqual([
      [['Feature', 'Measure'], ['First', '14'], ['Second', '29']]
    ]);
    expect(visibleText(result).split('Section overview')).toHaveLength(2);
    expect(result.findIndex(element => element.text === 'Section overview')).toBeLessThan(result.findIndex(element => element.type === 'table'));
    expect(elements).toEqual(original);
    expect(metrics).toEqual(originalMetrics);
  });

  it('retains a separate section heading even when unrelated graphics intersect its area', () => {
    const section = column([line('Section overview', 60, 60, true)], 0, 'heading');
    const localGraphics = { lines: [...graphics.lines, ...[55, 65].map(y => ({ x1: 40, x2: 500, y1: y, y2: y, lineWidth: 0.5 }))] };
    expect(checkGraphicsInElementArea([section], localGraphics, null, 11).hasGraphics).toBe(true);
    const elements = [section, column(left, 0, 'heading'), column(right, 1, 'paragraph')];
    const original = structuredClone(elements);
    const result = mergeColumnElementsIntoTables(elements, {
      ...metrics, graphicsData: { 1: localGraphics }
    });
    expect(result.filter(element => element.type === 'heading')).toContain(section);
    expect(visibleText(result).split('Section overview')).toHaveLength(2);
    expect(elements).toEqual(original);
  });

  it('keeps aligned headings above the table out of its rows and header detection', () => {
    const leftSection = line('First section overview', 60, 83, true);
    const rightSection = line('Second section overview', 230, 83, true);
    const leftAfter = line('First following section', 60, 151, true);
    const rightAfter = line('Second following section', 230, 151, true);
    const group = (lines, index) => groupLinesIntoElements(lines, { ...metrics, columnIndex: index })
      .map(element => ({ ...element, columnIndex: index }));
    const elements = [...group([leftSection, ...left, leftAfter], 0), ...group([rightSection, ...right, rightAfter], 1)];
    const original = structuredClone(elements);
    const result = mergeColumnElementsIntoTables(elements, metrics);
    expect(result.filter(element => element.type === 'table').map(element => element.rows)).toEqual([
      [['Feature', 'Measure'], ['First', '14'], ['Second', '29']]
    ]);
    const tableIndex = result.findIndex(element => element.type === 'table');
    for (const text of ['First section overview', 'Second section overview', 'First following section', 'Second following section']) {
      expect(visibleText(result).split(text)).toHaveLength(2);
      const index = result.findIndex(element => element.type !== 'table' && element.text.includes(text));
      expect(index).toBeGreaterThanOrEqual(0);
      if (text.includes('following')) expect(index).toBeGreaterThan(tableIndex);
      else expect(index).toBeLessThan(tableIndex);
    }
    expect(elements).toEqual(original);
  });

  it('preserves aligned section headings separated by decorative rules without table-cell evidence', () => {
    const decorative = { lines: [90, 110, 130].map(y => ({ x1: 40, x2: 500, y1: y, y2: y, lineWidth: 0.5 })) };
    const sections = [['Methods', 'Limitations'], ['Results', 'Discussion']].flatMap((texts, index) => {
      const lines = texts.map((text, row) => ({ ...line(text, 60 + index * 200, 100 + row * 20, true), fontSize: 14 }));
      return groupLinesIntoElements(lines, { ...metrics, columnIndex: index })
        .map(element => ({ ...element, columnIndex: index }));
    });
    expect(sections.every(element => element.type === 'heading')).toBe(true);
    const original = structuredClone(sections);
    const result = mergeColumnElementsIntoTables(sections, { ...metrics, graphicsData: { 1: decorative } });
    expect(result.every(element => element.type === 'heading')).toBe(true);
    for (const text of ['Methods', 'Limitations', 'Results', 'Discussion']) expect(visibleText(result).split(text)).toHaveLength(2);
    expect(sections).toEqual(original);
  });

  it('sorts the table by consumed rows rather than the original paragraph extent', () => {
    const section = line('Section before the table', 60, 90, true);
    const leftGroup = groupLinesIntoElements([section, ...left], { ...metrics, columnIndex: 0 })
      .map(element => ({ ...element, columnIndex: 0 }));
    const rightGroup = column([line('Introductory observation.', 230, 83, false), ...right], 1, 'paragraph');
    const elements = [...leftGroup, rightGroup];
    const original = structuredClone(elements);
    const result = mergeColumnElementsIntoTables(elements, metrics);
    const tableIndex = result.findIndex(element => element.type === 'table');
    const sectionIndex = result.findIndex(element => element.type !== 'table' && element.text.includes('Section before the table'));
    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(sectionIndex).toBeGreaterThanOrEqual(0);
    expect(sectionIndex).toBeLessThan(tableIndex);
    expect(result[tableIndex]).toMatchObject({ minY: 100, maxY: 134 });
    expect(result[tableIndex].lines.map(item => item.text)).toEqual(['Feature', 'Measure', 'First', '14', 'Second', '29']);
    expect(visibleText(result).split('Introductory observation.')).toHaveLength(2);
    expect(elements).toEqual(original);
  });

  it('returns unused lines of a partially consumed table fragment as ordinary paragraph content', () => {
    const fragment = column([line('Introductory observation.', 60, 83, false), ...left], 0, 'table-fragment');
    const elements = [fragment, column(right, 1, 'paragraph')];
    const original = structuredClone(elements);
    const result = mergeColumnElementsIntoTables(elements, metrics);
    const remainder = result.find(element => element.text === 'Introductory observation.');
    expect(remainder).toMatchObject({ type: 'paragraph', minY: 83, maxY: 83 });
    expect(visibleText(result).split('Introductory observation.')).toHaveLength(2);
    expect(result.find(element => element.type === 'table').lines.map(item => item.text)).not.toContain('Introductory observation.');
    expect(elements).toEqual(original);
  });

  it('does not extend one shaded header grid through the next table and consume headings between them', () => {
    const leftNext = [line('Category', 60, 168, true), line('Third', 60, 185, true), line('Fourth', 60, 202, true)];
    const rightNext = [line('Amount', 230, 168, true), line('42', 230, 185, false), line('58', 230, 202, false)];
    const group = (lines, index) => groupLinesIntoElements(lines, { ...metrics, columnIndex: index })
      .map(element => ({ ...element, columnIndex: index }));
    const elements = [
      ...group([...left, line('First intermediate section', 60, 151, true), ...leftNext], 0),
      ...group([...right, line('Second intermediate section', 230, 151, true), ...rightNext], 1)
    ];
    const adjacentGraphics = {
      lines: [...graphics.lines, ...graphics.lines.map(item => ({ ...item, y1: item.y1 + 68, y2: item.y2 + 68 }))],
      rectangles: [...graphics.rectangles, ...graphics.rectangles.map(item => ({ ...item, y: item.y + 68 }))]
    };
    const original = structuredClone(elements);
    const result = mergeColumnElementsIntoTables(elements, { ...metrics, graphicsData: { 1: adjacentGraphics } });
    expect(result.filter(element => element.type === 'table').map(element => element.rows)).toEqual([
      [['Feature', 'Measure'], ['First', '14'], ['Second', '29']],
      [['Category', 'Amount'], ['Third', '42'], ['Fourth', '58']]
    ]);
    const tableIndices = result.flatMap((element, index) => element.type === 'table' ? [index] : []);
    for (const text of ['First intermediate section', 'Second intermediate section']) {
      expect(visibleText(result).split(text)).toHaveLength(2);
      const index = result.findIndex(element => element.type !== 'table' && element.text.includes(text));
      expect(index).toBeGreaterThan(tableIndices[0]);
      expect(index).toBeLessThan(tableIndices[1]);
    }
    expect(elements).toEqual(original);
  });

  it.each([108.5, 125.5])('keeps the table when a body cell at Y=%s has a shaded fill', y => {
    const elements = [column(left, 0, 'heading'), column(right, 1, 'paragraph')];
    const shadedBody = { ...graphics, rectangles: [...graphics.rectangles, { x: 50, y, width: 150, height: 17 }] };
    const inputMetrics = { ...metrics, graphicsData: { 1: shadedBody } };
    const original = structuredClone({ elements, inputMetrics });
    const result = mergeColumnElementsIntoTables(elements, inputMetrics);
    expect(result.filter(element => element.type === 'table').map(element => element.rows)).toEqual([
      [['Feature', 'Measure'], ['First', '14'], ['Second', '29']]
    ]);
    expect({ elements, inputMetrics }).toEqual(original);
  });

  it('keeps a shaded body row within the same table instead of treating it as another header band', () => {
    const elements = [column(left, 0, 'heading'), column(right, 1, 'paragraph')];
    const shadedRow = { ...graphics, rectangles: [...graphics.rectangles,
      ...graphics.rectangles.map(item => ({ ...item, y: 125.5 }))] };
    const inputMetrics = { ...metrics, graphicsData: { 1: shadedRow } };
    const original = structuredClone({ elements, inputMetrics });
    const result = mergeColumnElementsIntoTables(elements, inputMetrics);
    expect(result.filter(element => element.type === 'table').map(element => element.rows)).toEqual([
      [['Feature', 'Measure'], ['First', '14'], ['Second', '29']]
    ]);
    expect({ elements, inputMetrics }).toEqual(original);
  });
});
