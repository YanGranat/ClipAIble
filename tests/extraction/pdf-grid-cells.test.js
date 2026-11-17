import { describe, expect, it } from 'vitest';
import { getBorderedGridRows } from '../../scripts/offscreen/pdf/utils/grid-cells.js';

const rows = [0, 1, 2].map(row => [0, 1, 2].map(column => ({ text: `r${row}c${column}`, x: 16 + column * 100, y: 28 + row * 25 })));
function grid() {
  return { lines: [
    ...[10, 110, 210, 310].map(x => ({ x1: x, x2: x, y1: 10, y2: 85 })),
    ...[10, 35, 60, 85].map(y => ({ x1: 10, x2: 310, y1: y, y2: y }))
  ] };
}

describe('Painted table cell boundaries', () => {
  it('uses complete painted borders independently of page column buckets', () => {
    expect(getBorderedGridRows(rows, grid(), 12, 3)).toEqual(rows.map(lines => lines.map(line => line.text)));
  });

  it('preserves the existing path for borderless column layouts', () => {
    expect(getBorderedGridRows(rows, { lines: [] }, 12, 3)).toBeNull();
  });

  it('rejects disconnected border segments and unrelated horizontal rules', () => {
    const graphics = grid();
    graphics.lines[1].y2 = 56;
    expect(getBorderedGridRows(rows, graphics, 12, 3)).toBeNull();
    const rules = grid();
    rules.lines = rules.lines.filter(line => line.y1 !== 35);
    expect(getBorderedGridRows(rows, rules, 12, 3)).toBeNull();
  });

  it('keeps a line spanning multiple border cells on its existing path', () => {
    const spanning = structuredClone(rows);
    spanning[0][0].items = [{ str: 'Left', x: 16 }, { str: 'Right', x: 216 }];
    expect(getBorderedGridRows(spanning, grid(), 12, 3)).toBeNull();
    spanning[0][0].items = [{ str: 'Overlapping cell text', x: 16, width: 140 }];
    expect(getBorderedGridRows(spanning, grid(), 12, 3)).toBeNull();
  });
});
