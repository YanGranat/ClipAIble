import { describe, expect, it } from 'vitest';
import { splitListHeadings } from '../../scripts/offscreen/pdf/processors/list-splitter.js';
import { groupConsecutiveListItems } from '../../scripts/offscreen/pdf/processors/list-grouper.js';

describe('PDF list content conservation', () => {
  it('keeps every heading line when a list starts within a later line', () => {
    const lines = [
      { text: 'A multiline heading', y: 10 },
      { text: 'continues here: • First item', y: 20 },
      { text: '• Second item', y: 30 }
    ];
    const result = splitListHeadings([{ combinedText: lines.map(line => line.text).join(' '), lines, minY: 10, maxY: 30 }]);
    expect(result.flatMap(block => block.lines).map(line => line.text).join(' ')).toBe(lines.map(line => line.text).join(' '));
    expect(result[0].lines.map(line => line.text)).toEqual(['A multiline heading', 'continues here:']);
  });

  it.each([true, false])('keeps lists from different columns separate (ordered=%s)', ordered => {
    const elements = [
      { type: 'list', text: `${ordered ? '1.' : '•'} Left item`, ordered, listLevel: 0, minX: 40, columnIndex: 0, pageNum: 1 },
      { type: 'list', text: `${ordered ? '1.' : '•'} Right item`, ordered, listLevel: 0, minX: 300, columnIndex: 1, pageNum: 1 }
    ];
    const result = groupConsecutiveListItems(elements, { baseFontSize: 12 });
    expect(result.map(list => list.items.map(item => item.text))).toEqual([['Left item'], ['Right item']]);
    expect(result.map(list => list.columnIndex)).toEqual([0, 1]);
  });

  it('preserves a nested list within the same column', () => {
    const result = groupConsecutiveListItems([
      { type: 'list', text: '1. Parent item', ordered: true, listLevel: 0, minX: 40, columnIndex: 0 },
      { type: 'list', text: '• Nested item', ordered: false, minX: 60, columnIndex: 0 },
      { type: 'list', text: '2. Next parent item', ordered: true, listLevel: 0, minX: 40, columnIndex: 0 }
    ], { baseFontSize: 12 });
    expect(result).toHaveLength(1);
    expect(result[0].items.map(item => item.text)).toEqual(['Parent item', 'Nested item', 'Next parent item']);
    expect(result[0].items.map(item => item.listLevel)).toEqual([0, 2, 0]);
  });

  it('keeps every column when a following page starts another left column list', () => {
    const result = groupConsecutiveListItems([
      { type: 'list', text: '1. First left item', ordered: true, listLevel: 0, minX: 40, columnIndex: 0, pageNum: 1 },
      { type: 'list', text: '1. Right item', ordered: true, listLevel: 0, minX: 300, columnIndex: 1, pageNum: 1 },
      { type: 'list', text: '1. Next page item', ordered: true, listLevel: 0, minX: 40, columnIndex: 0, pageNum: 2 }
    ], { baseFontSize: 12 });
    expect(result.map(list => list.items.map(item => item.text))).toEqual([
      ['First left item'], ['Right item'], ['Next page item']
    ]);
  });
});
