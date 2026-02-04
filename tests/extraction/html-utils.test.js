// Unit tests for scripts/extraction/html-utils.js (deduplicateContent)

import { describe, it, expect } from 'vitest';
import { deduplicateContent } from '../../scripts/extraction/html-utils.js';

describe('deduplicateContent', () => {
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
    const result = deduplicateContent(content);
    expect(result).toHaveLength(3);
    expect(result[0].items[0].html).toContain('молекулярных');
    expect(result[1].items[0].html).toContain('Дестабилизация');
    expect(result[2].items[0].html).toContain('Нарушения');
  });

  it('should deduplicate only when item.items text is identical', () => {
    const content = [
      { type: 'list', items: [{ html: '<p>Same text</p>', id: '' }] },
      { type: 'list', items: [{ html: '<p>Same text</p>', id: '' }] },
      { type: 'list', items: [{ html: '<p>Different text</p>', id: '' }] }
    ];
    const result = deduplicateContent(content);
    expect(result).toHaveLength(2);
  });
});
