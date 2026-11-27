import { expect, it } from 'vitest';
import { detectPdfPage, isPdfUrl } from '../../scripts/utils/pdf.js';
it.each([
  ['https://example.org/document.PDF?download=1#page=2', true],
  ['https://example.org/download?type=pdf', true],
  ['https://example.org/download?content-type=application%2Fpdf', true],
  ['https://example.org/article?note=type=pdf', false],
  ['https://example.org/article?prototype=pdf', false],
  ['https://example.org/article#type=pdf', false],
  ['https://example.org/article?type=pdf-preview', false]
])('uses exact PDF URL fields: %s', (url, expected) => expect(isPdfUrl(url)).toBe(expected));

it.each(['https://example.org/files/42', 'file:///reading-room/report'])(
  'recognizes a PDF document with an extensionless address: %s',
  (url) => expect(detectPdfPage(url, url, '<html></html>', 'application/pdf'))
    .toEqual({ isPdf: true, originalUrl: url })
);

it.each([
  ['https://example.org/files/42', 'text/html'],
  ['https://example.org/files/42', 'application/pdf-preview'],
  ['data:application/pdf,example', 'application/pdf']
])('does not use an unsupported MIME or address as a PDF source: %s %s', (url, mime) => {
  expect(detectPdfPage(url, url, '<html></html>', mime)).toBeNull();
});
