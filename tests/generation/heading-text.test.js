import { expect, it, vi } from 'vitest';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';

vi.mock('../../scripts/api/blob-download.js', () => ({ downloadBlob: vi.fn(async () => 1) }));

it('keeps authored heading text in Markdown and FB2', async () => {
  const input = {
    title: 'Sensor measurements',
    generateToc: true,
    content: [
      { type: 'heading', id: 'calibration', level: 2, text: 'T220 sensor response' },
      { type: 'paragraph', text: 'The sensor was tested under laboratory conditions.' },
      { type: 'heading', id: 'comparison', level: 2, text: 'T031' },
      { type: 'paragraph', text: 'The comparison model followed the same procedure.' },
    ],
  };

  const markdown = await generateMarkdown(input);
  expect(markdown.match(/T220 sensor response/g) || []).toHaveLength(2);
  expect(markdown.match(/\bT031\b/g) || []).toHaveLength(2);
  expect(markdown).toContain('<a id="calibration"></a>');

  const fb2 = await generateFb2(input);
  const xml = await fb2.text();
  expect(xml.match(/T220 sensor response/g) || []).toHaveLength(2);
  expect(xml.match(/\bT031\b/g) || []).toHaveLength(2);
  expect(xml).toContain('id="calibration"');
});
