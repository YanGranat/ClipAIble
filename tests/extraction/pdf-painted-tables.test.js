import { expect, it, vi } from 'vitest';
import { extractPaintedTables } from '../../scripts/offscreen/pdf/utils/grid-cells.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn() }));
const item = (str, x, y, width = 30, fontSize = 10) => ({ str, x, y, width, fontSize });
const line = items => ({ x: items[0].x, y: items[0].y, pageNum: 1, text: items.map(x => x.str).join(' '), items });
const rule = (y, left = 10, right = 610) => ({ x1: left, x2: right, y1: y, y2: y, lineWidth: 0.5 });

it('recovers a horizontal ruled table independently of page reading columns and keeps outside prose', () => {
  const rows = [['Record', 'Value', 'Unit'], ['First', '18', 'mm'], ['Second', '27', 'mm']];
  const lines = rows.map((row, index) => line(row.map((str, column) => item(str, 20 + column * 190, 25 + index * 20))));
  const outside = line([item('An ordinary paragraph remains outside the table.', 20, 120, 500)]);
  const result = extractPaintedTables([...lines, outside], { lines: [rule(10), rule(35), rule(80)] }, 10);
  expect(result.tables.map(table => table.rows)).toEqual([rows]);
  expect(result.remainingLines).toEqual([outside]);
  expect(new Set(result.tables[0].lines)).toEqual(new Set(lines));
});

it('preserves sparse columns and expands only a geometrically grouped header', () => {
  const xs = Array.from({ length: 8 }, (_, index) => 20 + index * 80);
  const full = ['Base', '3', '5', '7', '11', '13', '17', '19'];
  const lines = [line([item('Metric', 125, 20, 45)]),
    line(['Group', 'A', 'B', 'Flag', 'Limit', 'Offset', 'Rate', 'Count'].map((str, column) => item(str, xs[column], 35))),
    line(full.map((str, column) => item(str, xs[column], 55))),
    line([item('Changed', xs[0], 70, 40), item('29', xs[1], 70), item('31', xs[6], 70), item('37', xs[7], 70)]),
    line([item('Variant', xs[0], 85, 40), item('Merged note', 110, 85, 160), item('41', xs[6], 85), item('43', xs[7], 85)])];
  const result = extractPaintedTables(lines, { lines: [rule(10), rule(45), rule(105), rule(28, 90, 245)] }, 10);
  expect(result.remainingLines).toEqual([]);
  expect(result.tables[0].rows).toEqual([
    ['Group', 'Metric / A', 'Metric / B', 'Flag', 'Limit', 'Offset', 'Rate', 'Count'], full,
    ['Changed', '29', '', '', '', '', '31', '37'], ['Variant', 'Merged note', '', '', '', '', '41', '43']
  ]);
});

it('keeps a raised script in its owned cell without adding a table row', () => {
  const lines = [line([item('Area', 20, 25), item('Volume', 250, 25)]),
    line([item('m', 20, 50, 5), item('2', 25, 46, 3, 6), item('m', 250, 50, 5), item('3', 255, 46, 3, 6)]),
    line([item('cm', 20, 70, 10), item('2', 30, 66, 3, 6), item('cm', 250, 70, 10), item('3', 260, 66, 3, 6)])];
  expect(extractPaintedTables(lines, { lines: [rule(10), rule(35), rule(85)] }, 10).tables[0].rows)
    .toEqual([['Area', 'Volume'], ['m2', 'm3'], ['cm2', 'cm3']]);
});

it('keeps a blank column before a merged cell proved by painted boundaries', () => {
  const xs = Array.from({ length: 8 }, (_, index) => 20 + index * 80);
  const full = ['Base', '3', '5', '7', '11', '13', '17', '19'];
  const lines = [line(['Group', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((str, column) => item(str, xs[column], 25))),
    line(full.map((str, column) => item(str, xs[column], 50))),
    line([item('Variant', xs[0], 70, 40), item('Merged description', 250, 70, 140), item('41', xs[6], 70), item('43', xs[7], 70)])];
  const vertical = x => ({ x1: x, x2: x, y1: 60, y2: 80, lineWidth: 0.5 });
  const graphics = { lines: [rule(10), rule(35), rule(85)], allLines: [vertical(155), vertical(475)] };
  expect(extractPaintedTables(lines, graphics, 10).tables[0].rows[2])
    .toEqual(['Variant', '', 'Merged description', '', '', '', '41', '43']);
  const numeric = { ...lines[2], items: [item('Variant', xs[0], 70, 40), item('29', xs[5], 70, 15), item('41', xs[6], 70), item('43', xs[7], 70)] };
  expect(extractPaintedTables([...lines.slice(0, 2), numeric], graphics, 10).tables[0].rows[2])
    .toEqual(['Variant', '', '', '', '', '29', '41', '43']);
});

it('keeps underlined prose and isolated fraction bars out of physical tables', () => {
  const lines = [line([item('A full-width ordinary paragraph.', 20, 25, 500)]), line([item('Another full-width ordinary paragraph.', 20, 50, 500)])];
  const result = extractPaintedTables(lines, { lines: [rule(10), rule(35), rule(65), rule(27, 200, 240)] }, 10);
  expect(result.tables).toEqual([]); expect(result.remainingLines).toEqual(lines);
});

it.each([0, 80, 500])('keeps disjoint same-width ruled tables separate from intervening prose of width %s', width => {
  const rows = [['Record', 'Value'], ['First', '18'], ['Second', '27']];
  const table = offset => rows.map((row, index) => line(row.map((str, column) => item(str, 20 + column * 200, 25 + offset + index * 20))));
  const first = table(0), second = table(120), prose = line([item('An intervening note.', 20, 105, width)]);
  const result = extractPaintedTables([...first, ...(width ? [prose] : []), ...second], { lines: [10, 35, 80, 130, 155, 200].map(y => rule(y)) }, 10);
  expect(result.tables.map(table => table.rows)).toEqual([rows, rows]);
  expect(result.remainingLines).toEqual(width ? [prose] : []);
});
