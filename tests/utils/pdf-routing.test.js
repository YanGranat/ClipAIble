import { expect, it } from 'vitest';
import { isPdfUrl } from '../../scripts/utils/pdf.js';
it.each([
  ['https://example.org/document.PDF?download=1#page=2', true],
  ['https://example.org/download?type=pdf', true],
  ['https://example.org/download?content-type=application%2Fpdf', true],
  ['https://example.org/article?note=type=pdf', false],
  ['https://example.org/article?prototype=pdf', false],
  ['https://example.org/article#type=pdf', false],
  ['https://example.org/article?type=pdf-preview', false]
])('uses exact PDF URL fields: %s', (url, expected) => expect(isPdfUrl(url)).toBe(expected));
