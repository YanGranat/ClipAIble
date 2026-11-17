import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));

import { splitIntoSentences } from '../../scripts/offscreen/tts/text-processing.js';

describe('Piper text splitting', () => {
  it.each([
    'A complete sentence. A trailing fragment',
    '...A sentence! A question? A final phrase',
    'A short fragment',
    'x'.repeat(2200),
    '\u6F22'.repeat(2200),
    '\u{1F600}'.repeat(220),
    'A complete sentence. '.repeat(120) + 'The final words'
  ])('preserves every non-whitespace character in the input', text => {
    const chunks = splitIntoSentences(text);
    expect(chunks.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
    expect(chunks.every(chunk => chunk.length > 0 && chunk.length <= 200)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it('produces no chunks for empty text', () => {
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences('   \n ')).toEqual([]);
  });
});
