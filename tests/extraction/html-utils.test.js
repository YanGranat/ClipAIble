// Unit tests for extraction content conservation.

import { describe, it, expect } from 'vitest';
import { mergeChunkContent } from '../../scripts/extraction/html-utils.js';

describe('mergeChunkContent', () => {
  it('should keep blocks with item.items[].html as distinct when content differs', () => {
    const content = [
      {
        type: 'list',
        items: [
          { html: '<strong>молекулярных механизмов старения;</strong>', id: '' },
          { html: '<strong> старения отдельных тканей;</strong>', id: '' }
        ]
      },
      {
        type: 'list',
        items: [
          { html: '<p>Дестабилизация генома клеток;</p>', id: '' },
          { html: '<p>Сокращение хромосомных теломер.</p>', id: '' }
        ]
      },
      {
        type: 'list',
        items: [
          { html: '<p>Нарушения протеостаза;</p>', id: '' }
        ]
      }
    ];
    const result = mergeChunkContent([content], ['']);
    expect(result).toHaveLength(3);
    expect(result[0].items[0].html).toContain('молекулярных');
    expect(result[1].items[0].html).toContain('Дестабилизация');
    expect(result[2].items[0].html).toContain('Нарушения');
  });

  it('preserves repeated list content within one independently extracted chunk', () => {
    const content = [
      { type: 'list', items: [{ html: '<p>Same text</p>', id: '' }] },
      { type: 'list', items: [{ html: '<p>Same text</p>', id: '' }] },
      { type: 'list', items: [{ html: '<p>Different text</p>', id: '' }] }
    ];
    const result = mergeChunkContent([content], ['']);
    expect(result).toEqual(content);
  });
});
