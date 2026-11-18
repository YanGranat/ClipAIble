import { expect, it, vi } from 'vitest';
import { sanitizeFilename } from '../../scripts/utils/security/security.js';

vi.mock('../../scripts/utils/logging.js', () => ({ logError: vi.fn(), logWarn: vi.fn() }));

it.each(['\u0000\u0001', '.', '..', '\u001f.\u007f'])('keeps a usable filename after removing invalid input %#', value => {
  expect(sanitizeFilename(value)).toBe('file');
});

it.each(['CON', 'nul', 'PRN.txt', 'AUX', 'COM3', 'LPT7.log', 'COM¹'])('avoids reserved Windows device names %s', value => {
  expect(sanitizeFilename(value)).toBe('_' + value);
});

it('preserves ordinary names, removes trailing dots and does not split a Unicode pair', () => {
  expect(sanitizeFilename('Notes.')).toBe('Notes');
  expect(sanitizeFilename('..A/B: C')).toBe('AB_C');
  const name = sanitizeFilename('x'.repeat(199) + '🚀');
  expect(name).toBe('x'.repeat(199));
  expect(sanitizeFilename('A useful chapter')).toBe('A_useful_chapter');
});
