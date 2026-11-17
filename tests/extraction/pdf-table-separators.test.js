import { expect, it, vi } from 'vitest';
import { extractTableStructure } from '../../scripts/offscreen/pdf/processors/table-extractor.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn() }));
const line = (y, items) => ({ y, x: items[0].x, text: items.map(item => item.str).join(' '), items });
it('keeps prose out of an unruled table when text crosses the proposed separators', () => {
  const lines = [line(50, [{ x: 50, width: 450, str: 'A full-width paragraph record.' }]),
    line(65, [{ x: 50, width: 450, str: 'Another full-width paragraph record.' }]),
    line(80, [{ x: 50, width: 150, str: 'A shorter prefix' }, { x: 350, width: 100, str: 'italic ending' }]),
    line(95, [{ x: 50, width: 150, str: 'A second prefix' }, { x: 350, width: 100, str: 'other ending' }])];
  expect(extractTableStructure({ lines }, { metrics: { baseFontSize: 10 } })).toBeNull();
});
it('assigns every borderless table item to a single separated cell', () => {
  const rows = [['Record', 'Value'], ['First', '18'], ['Second', '27']];
  const lines = rows.map((row, index) => line(50 + index * 15, row.map((str, column) => ({ x: 50 + column * 200, width: 70, str }))));
  expect(extractTableStructure({ lines }, { metrics: { baseFontSize: 10 } }).rows).toEqual(rows);
});

it('does not use script-sized fragments as independent columns of surrounding prose', () => {
  const rows = [
    [{ x: 50, width: 5, str: 'a', fontSize: 6 }, { x: 200, width: 90, str: 'Unit metadata', fontSize: 10 }],
    [{ x: 50, width: 5, str: 'i', fontSize: 6 }, { x: 100, width: 5, str: 'j', fontSize: 6 }],
    [{ x: 50, width: 5, str: 'b', fontSize: 6 }, { x: 100, width: 5, str: 'k', fontSize: 6 }, { x: 200, width: 90, str: 'Coefficient note', fontSize: 10 }]
  ].map((items, index) => line(50 + index * 15, items));
  expect(extractTableStructure({ lines: rows }, { metrics: { baseFontSize: 10 } })).toBeNull();
});

it('retains a uniformly small mathematical matrix with real row and column alignment', () => {
  const rows = [['a', 'b'], ['c', 'd']];
  const lines = rows.map((row, index) => line(50 + index * 15, row.map((str, column) => ({ x: 50 + column * 200, width: 5, fontSize: 6, str }))));
  expect(extractTableStructure({ lines }, { metrics: { baseFontSize: 10 } }).rows).toEqual(rows);
});
