import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn()
}));

import { splitIntoSentences, sanitizeText } from '../../scripts/offscreen/tts/text-processing.js';
describe('Piper text preservation', () => {
  it('normalizes typography without deleting letters or mathematical symbols', () => {
    expect(sanitizeText('“Don’t” erase café or naïve names. № 7: €12 + £3 = ¥15 ± 2°.', 'en'))
      .toBe('"Don\'t" erase café or naïve names. № 7: €12 + £3 = ¥15 ± 2°.');
    expect(sanitizeText('Результат: 5 + 2 = 7; № 3, $10.', 'ru'))
      .toBe('Результат: 5 + 2 = 7; № 3, $10.');
  });
  it('keeps the precision and units of decimal numbers on the Russian Piper route', () => {
    const text = 'Температура −2,5 °C. Изменение 0,05%, положение 1,005. Контроль 4,2. Примеры f(1,02), f(-1,02) и версия 2.3.4.';
    expect(sanitizeText(text, 'ru')).toBe('Температура −2 запятая 5 градуса Цельсия. Изменение 0 запятая 0 5 процента, положение 1 запятая 0 0 5. Контроль 4,2. Примеры f(1,02), f(-1,02) и версия 2.3.4.');
    expect(sanitizeText(text, 'en')).toBe(text);
  });
});

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

  it('keeps decimals and short abbreviations in their spoken phrase', () => {
    expect(splitIntoSentences('Dr. Stone measured 3.14 volts. Next reading.'))
      .toEqual(['Dr. Stone measured 3.14 volts.', 'Next reading.']);
    expect(splitIntoSentences('Prof. Chen uses e.g. a 1,200.50-unit probe. Final reading.'))
      .toEqual(['Prof. Chen uses e.g. a 1,200.50-unit probe.', 'Final reading.']);
  });
});
