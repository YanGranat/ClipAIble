import { expect, it } from 'vitest';
import { processContent } from '../../scripts/offscreen/pdf/core/content-processor.js';

function listItem(text, ordered, minX, y) {
  return {
    type: 'list',
    pageNum: 1,
    columnIndex: 0,
    minY: y,
    maxY: y,
    minX,
    text,
    ordered,
    listType: ordered ? 'ordered' : 'unordered',
    listPattern: ordered ? 'numbered' : 'bullet',
    listLevel: 0
  };
}

function processLists(items) {
  return processContent(items, { baseFontSize: 12 }, { title: 'Field notes' }, 'https://example.test/notes.pdf').elements;
}

it('retains adjacent ordered and unordered lists in their original order', () => {
  const lists = processLists([
    listItem('1. Initial observation', true, 40, 20),
    listItem('• Separate qualification', false, 40, 40),
    listItem('2. Final observation', true, 40, 60)
  ]);

  expect(lists.map(list => [list.ordered, list.items.map(item => item.text)])).toEqual([
    [true, ['Initial observation']],
    [false, ['Separate qualification']],
    [true, ['Final observation']]
  ]);
});

it('continues the same ordered list after an indented bullet', () => {
  const lists = processLists([
    listItem('1. Initial observation', true, 40, 20),
    listItem('• Nested qualification', false, 53, 40),
    listItem('2. Final observation', true, 40, 60)
  ]);

  expect(lists).toHaveLength(1);
  expect(lists[0]).toMatchObject({
    ordered: true,
    items: [
      { text: 'Initial observation', listLevel: 0 },
      { text: 'Nested qualification', listLevel: 1, isOrdered: false, parentIsOrdered: true },
      { text: 'Final observation', listLevel: 0, isOrdered: true }
    ]
  });
});
