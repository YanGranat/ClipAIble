import { describe, expect, it } from 'vitest';
import { mergeColumnElementsIntoTables } from '../../scripts/offscreen/pdf/processors/table-column-merger.js';
import { detectTableRegionsFromGraphics } from '../../scripts/offscreen/pdf/utils/graphics-extractor.js';

const firstRows = [['Alpha', 'Beta'], ['A', 'One'], ['B', 'Two'], ['C', 'Three']];
const secondRows = [['Gamma', 'Delta', 'Epsilon'], ['D', 'Four', 'Yes'], ['E', 'Five', 'No'], ['F', 'Six', 'Yes'], ['G', 'Seven', 'No']];

function tableFragments(rows, startY, columns, { headerBold = true, bodyBold = false } = {}) {
  const elements = [];
  const graphics = [];
  for (let row = 0; row < rows.length; row++) {
    for (const y of [startY + row * 17 - 8.5, startY + row * 17 + 8.5]) {
      graphics.push({ x1: 50, x2: 500, y1: y, y2: y, lineWidth: 0.5 });
    }
  }
  for (let column = 0; column < columns.length; column++) {
    const lines = rows.map((row, index) => ({
      text: row[column], x: columns[column].x, y: startY + index * 17,
      fontSize: 11, isBold: index === 0 ? headerBold : bodyBold
    }));
    const element = (type, selected) => ({ type, lines: selected,
      text: selected.map(line => line.text).join(' '), pageNum: 1, columnIndex: columns[column].index,
      minX: columns[column].x, maxX: columns[column].x + 80, minY: selected[0].y, maxY: selected.at(-1).y });
    if (column === 0) elements.push(element('heading', lines));
    else elements.push(element('heading', lines.slice(0, 1)), element('paragraph', lines.slice(1)));
  }
  const rectangles = columns.map((column, index) => ({ x: column.x - 10, y: startY - 8.5,
    width: (columns[index + 1]?.x - 10 || 500) - (column.x - 10), height: 17 }));
  return { elements, graphics, rectangles };
}

function fixture(options) {
  const first = tableFragments(firstRows, 100, [{ x: 60, index: 0 }, { x: 230, index: 2 }], options);
  const second = tableFragments(secondRows, 350, [{ x: 60, index: 0 }, { x: 200, index: 1 }, { x: 370, index: 3 }], options);
  const sections = [60, 310].map((y, index) => ({ type: 'heading', text: `Section ${index + 1}`, pageNum: 1,
    columnIndex: 0, minY: y, maxY: y, lines: [{ text: `Section ${index + 1}`, x: 50, y, isBold: true }] }));
  return { elements: [...sections, ...first.elements, ...second.elements], sections,
    metrics: { baseFontSize: 11, graphicsData: { 1: { lines: [...first.graphics, ...second.graphics],
      rectangles: [...first.rectangles, ...second.rectangles] } } } };
}

describe('PDF table header ownership', () => {
  it('reunites bold column fragments into two complete bordered tables in reading order', () => {
    const { elements, sections, metrics } = fixture();
    const result = mergeColumnElementsIntoTables(elements, metrics);
    const tables = result.filter(element => element.type === 'table');
    expect(tables.map(table => table.rows)).toEqual([firstRows, secondRows]);
    expect(tables.map(table => table.hasHeaders)).toEqual([true, true]);
    expect(result.filter(element => element.type === 'heading')).toEqual(sections);
  });

  it('uses the first row formatting without treating bold body rows as headers', () => {
    const { elements, metrics } = fixture({ headerBold: false, bodyBold: true });
    const tables = mergeColumnElementsIntoTables(elements, metrics).filter(element => element.type === 'table');
    expect(tables.map(table => table.rows)).toEqual([firstRows, secondRows]);
    expect(tables.map(table => table.hasHeaders)).toEqual([false, false]);
  });

  it('preserves aligned headings without table graphics on their existing path', () => {
    const { elements } = tableFragments(firstRows, 100, [{ x: 60, index: 0 }, { x: 230, index: 1 }]);
    const headings = elements.map(element => ({ ...element, type: 'heading' }));
    const result = mergeColumnElementsIntoTables(headings, { baseFontSize: 11 });
    expect(result).toHaveLength(headings.length);
    expect(result.every(element => element.type === 'heading')).toBe(true);
    expect(new Set(result)).toEqual(new Set(headings));
  });

  it('retains existing detection for borderless paragraph column fragments', () => {
    const { elements } = tableFragments(firstRows, 100, [{ x: 60, index: 0 }, { x: 230, index: 1 }]);
    const paragraphs = elements.map(element => ({ ...element, type: 'paragraph' }));
    const tables = mergeColumnElementsIntoTables(paragraphs, { baseFontSize: 11 }).filter(element => element.type === 'table');
    expect(tables.map(table => table.rows)).toEqual([firstRows]);
    expect(tables[0].hasHeaders).toBe(true);
  });

  it('reunites heading cells inside a complete grid without shaded rectangles', () => {
    const { elements, graphics } = tableFragments(firstRows, 100, [{ x: 60, index: 0 }, { x: 230, index: 1 }]);
    const lines = [...graphics, ...[50, 220, 500].map(x => ({ x1: x, x2: x, y1: 91.5, y2: 159.5, lineWidth: 0.5 }))];
    const tableRegions = detectTableRegionsFromGraphics(lines, [], null, 11);
    expect(tableRegions).toHaveLength(1);
    const tables = mergeColumnElementsIntoTables(elements, { baseFontSize: 11,
      graphicsData: { 1: { lines, rectangles: [], tableRegions } } }).filter(element => element.type === 'table');
    expect(tables.map(table => table.rows)).toEqual([firstRows]);
    expect(tables[0].hasHeaders).toBe(true);
  });

  it('does not treat the bounding box of disconnected intersections as a complete table grid', () => {
    const { elements } = tableFragments(firstRows, 100, [{ x: 60, index: 0 }, { x: 230, index: 1 }]);
    const headings = elements.map(element => ({ ...element, type: 'heading' }));
    const lines = [90, 130, 170].map(y => ({ x1: 50, x2: 500, y1: y, y2: y, lineWidth: 0.5 }));
    for (const x of [50, 220, 500]) {
      for (const y of [90, 130, 170]) lines.push({ x1: x, x2: x, y1: y - 15, y2: y + 15, lineWidth: 0.5 });
    }
    const tableRegions = detectTableRegionsFromGraphics(lines, [], null, 11);
    expect(tableRegions).toHaveLength(1);
    expect(tableRegions[0]).toMatchObject({ rowCount: 2, columnCount: 2 });
    const result = mergeColumnElementsIntoTables(headings, { baseFontSize: 11,
      graphicsData: { 1: { lines, rectangles: [], tableRegions } } });
    expect(result.every(element => element.type === 'heading')).toBe(true);
    expect(new Set(result)).toEqual(new Set(headings));
  });
});
