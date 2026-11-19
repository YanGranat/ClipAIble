import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { contentToPlainText, prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { documentText, documentMarkdown, listHtml, tableCellHtml } from '../../scripts/generation/document-content.js';
import { serializeXmlInline } from '../../scripts/generation/xml.js';

vi.mock('../../scripts/api/index.js', () => ({ callAI: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { GENERATING: { id: 'generating' } }, getProcessingState: () => ({}), isCancelled: () => false }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async original => ({ ...await original(), checkCancellation: vi.fn(async () => {}) }));

const backlink = '<a role="doc-backlink" href="#reference"><sup>9</sup><strong>Return</strong> &#x21a9;</a>';
const paragraph = html => ({ type: 'paragraph', html });

describe('Narration of document backlinks', () => {
  it('preserves the semantic carrier, visible label and destination in document HTML', () => {
    const html = documentText(paragraph('Note ' + backlink + ' ending.'));
    const dom = new JSDOM(html);
    try {
      const link = dom.window.document.querySelector('a');
      expect(link.getAttribute('role')).toBe('doc-backlink');
      expect(link.getAttribute('href')).toBe('#reference');
      expect(link.textContent).toContain('9Return');
      expect(documentMarkdown(paragraph(html))).toContain('#reference');
      expect(serializeXmlInline(html, 'fb2')).toContain('l:href="#reference"');
      expect(serializeXmlInline(html, 'fb2')).not.toContain('role=');
      expect(serializeXmlInline(html, 'epub')).toContain('href="#reference"');
    } finally { dom.window.close(); }
  });

  it('omits the whole marked navigation subtree from direct and offline narration without mutating input', async () => {
    const content = [paragraph('The note remains. ' + backlink + ' The next statement remains.')];
    const before = structuredClone(content);
    expect(contentToPlainText(content)).toBe('The note remains. The next statement remains.');
    const chunks = await prepareContentForAudio(content, '', '', '', 'en', undefined, 'offline');
    expect(chunks.map(chunk => chunk.text).join('\n\n')).toBe('The note remains. The next statement remains.');
    expect(content).toEqual(before);
  });

  it.each(['heading', 'subtitle', 'quote', 'blockquote'])('uses the same projection for %s content', type => {
    const text = contentToPlainText([{ type, html: 'Required statement. ' + backlink }]);
    expect(text).toContain('Required statement.');
    expect(text).not.toContain('Return');
    expect(text).not.toContain('9');
  });

  it('projects nested lists, table cells and image captions through the same semantic boundary', () => {
    const content = [
      { type: 'list', items: [{ html: 'Outer. ' + backlink + '<ul><li>Inner. ' + backlink + '</li></ul>' }] },
      { type: 'table', cellFormat: 'html', headers: ['Value ' + backlink], rows: [['Measured 27. ' + backlink]] },
      { type: 'image', caption: 'Plot description. ' + backlink }
    ];
    expect(contentToPlainText(content)).toBe('Outer. Inner.\n\nValue: Measured 27.\n\nImage: Plot description.');
    expect(listHtml(content[0])).toContain('role="doc-backlink"');
    expect(tableCellHtml(content[1], content[1].headers[0])).toContain('role="doc-backlink"');
  });

  it('preserves ordinary links, numeric note references and authored arrows', () => {
    const html = 'Result <a href="#note" role="doc-noteref">3</a>, <a href="https://example.test/reading">required reading</a>, and an ordinary &#x21a9; arrow.';
    expect(contentToPlainText([paragraph(html)])).toBe('Result 3, required reading, and an ordinary ↩ arrow.');
    expect(contentToPlainText([paragraph('<span role="doc-backlink">Required 7.</span>')])).toBe('Required 7.');
  });

  it('does not interpret a nonmatching role or a later duplicate role as navigation', () => {
    const html = '<a role="link" role="doc-backlink" href="#source">Required 3.</a> <a role="doc-backlinks" href="#source">Required 4.</a>';
    expect(contentToPlainText([paragraph(html)])).toBe('Required 3. Required 4.');
  });

  it.each(['code', 'pre'])('preserves backlink-shaped literal %s examples before a neighboring real navigation link', tag => {
    const content = [{ type: 'list', items: [{ html: `<${tag}>${backlink}</${tag}> Required prose. ${backlink}` }] }];
    const text = contentToPlainText(content);
    expect(text).toContain('9Return');
    expect(text).toContain('Required prose.');
    expect(text.match(/Return/g)).toHaveLength(1);
    const inline = contentToPlainText([paragraph(`<${tag}>${backlink}</${tag}> Required prose.`)]);
    expect(inline).toContain('9Return');
  });

  it('keeps explicit text and native PDF glyphs literal in paragraphs, captions and tables', () => {
    const native = { pageNum: 1, lines: [{ items: [{ str: backlink }] }] };
    for (const extra of [{ format: 'text' }, native]) {
      expect(contentToPlainText([{ type: 'paragraph', text: backlink, ...extra }])).toBe(backlink);
      expect(contentToPlainText([{ type: 'image', caption: backlink, ...extra }])).toBe('Image: ' + backlink);
    }
    expect(contentToPlainText([{ type: 'table', cellFormat: 'text', rows: [[backlink]] }])).toBe(backlink);
  });

  it('retains a following ordinary anchor when HTML implies the end of a malformed backlink', () => {
    const html = '<a role="doc-backlink" href="#reference">Return<a href="https://example.test/reading">Required reading.</a> Ending.';
    expect(contentToPlainText([paragraph(html)])).toBe('Required reading. Ending.');
  });

  it('keeps mathematical operators and substantive numbers adjacent to navigation', () => {
    const html = `Measured 27. ${backlink} <span class="math">x<sup>r+1</sup> + y<sub>i</sub></span>.`;
    expect(contentToPlainText([paragraph(html)])).toBe('Measured 27. x^{r+1} + y_{i}.');
  });
});
