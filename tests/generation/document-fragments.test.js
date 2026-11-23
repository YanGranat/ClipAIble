import { describe, expect, it } from 'vitest';
import { documentText, listHtml, prepareDocumentContent, tableCellHtml } from '../../scripts/generation/document-content.js';
import { tokenizeHtml, decodeEntities } from '../../scripts/utils/html/tokenizer.js';

const normalizeDocumentContent = (...args) => prepareDocumentContent(...args).content;

const source = 'https://example.test/report?key=a%26b';
function hrefs(html) {
  return tokenizeHtml(html).filter(token => token.type === 'tag' && token.name === 'a' && !token.closing)
    .flatMap(token => token.attrs.filter(attr => attr.name === 'href').map(attr => decodeEntities(attr.value)));
}

describe('Final document fragment ownership', () => {
  it('uses actual retained block and inline targets while externalizing an omitted title reference', () => {
    const content = [
      { type: 'heading', level: 1, id: 'title', text: 'Field observations' },
      { type: 'paragraph', id: 'body', html: '<sup id="body-ref">2</sup> Measurements remain stable.' },
      { type: 'heading', level: 2, id: 'section', text: 'Results' },
      { type: 'list', ordered: true, items: [{ id: 'note', html: '<a href="#body-ref">Return</a> <a href="#title">Title source</a> <a href="#body">Body</a> <a href="#section">Section</a>' }] }
    ];
    const before = structuredClone(content);
    const result = normalizeDocumentContent(content, 'Field observations', source);
    expect(result.filter(item => item.type === 'heading' && item.level === 1)).toEqual([]);
    expect(hrefs(listHtml(result.find(item => item.type === 'list'), source))).toEqual(['#body-ref', source + '#title', '#body', '#section']);
    expect(content).toEqual(before);
    expect(normalizeDocumentContent(result, 'Field observations', source)).toEqual(result);
  });

  it('applies the explicit FB2 inline-target capability without changing visible note text', () => {
    const content = [
      { type: 'paragraph', id: 'body', html: '<sup id="body-ref">2</sup> Measurements remain stable.' },
      { type: 'list', ordered: true, items: [{ id: 'note', html: '<a href="#body-ref">Return</a> <a href="#body">Body</a>' }] }
    ];
    const result = normalizeDocumentContent(content, '', source, { inlineFragmentTargets: false });
    expect(hrefs(listHtml(result[1], source))).toEqual([source + '#body-ref', '#body']);
    expect(result[1].items[0].html).toContain('Return');
  });

  it('normalizes legacy Markdown paragraphs, string list items and Markdown table cells without a format roundtrip', () => {
    const content = [
      { type: 'paragraph', id: 'body', format: 'text', text: 'The retained measurement.' },
      { type: 'paragraph', text: '**Read** [the measurement](#body) and [the source](#absent "Keep title").' },
      { type: 'list', ordered: false, items: ['*Read* [the source](#absent)'] },
      { type: 'table', rows: [['`[literal](#absent)` [source](#absent)']] }
    ];
    const before = structuredClone(content), result = normalizeDocumentContent(content, '', source);
    expect(result[1].text).toBe(`**Read** [the measurement](#body) and [the source](${source}#absent "Keep title").`);
    expect(result[2].items[0]).toBe(`*Read* [the source](${source}#absent)`);
    expect(result[3].rows[0][0]).toBe(`\`[literal](#absent)\` [source](${source}#absent)`);
    expect(result[1].html).toBeUndefined();
    expect(result[3].cellFormat).toBeUndefined();
    expect(content).toEqual(before);
  });

  it('collects nested list and HTML table targets through their actual renderer contracts', () => {
    const content = [
      { type: 'paragraph', html: '<a href="#nested">Nested</a> <a href="#cell">Cell</a>' },
      { type: 'list', items: [{ id: 'parent', html: '<ul><li id="nested">Nested measurement</li></ul>' }] },
      { type: 'table', cellFormat: 'html', rows: [['<span id="cell">Measured value</span>']] }
    ];
    const result = normalizeDocumentContent(content, '', source);
    expect(hrefs(documentText(result[0], source))).toEqual(['#nested', '#cell']);
    const fb2 = normalizeDocumentContent(content, '', source, { inlineFragmentTargets: false });
    expect(hrefs(documentText(fb2[0], source))).toEqual(['#nested', source + '#cell']);
    expect(tableCellHtml(result[2], result[2].rows[0][0], source)).toContain('id="cell"');
  });

  it('does not claim literal, dropped or unrendered heading-inner identifiers as targets', () => {
    const content = [
      { type: 'heading', level: 2, html: '<span id="heading-inner">Results</span>' },
      { type: 'paragraph', html: '<div id="dropped">Retained prose.</div>' },
      { type: 'paragraph', format: 'text', text: '<span id="literal">Not HTML</span>' },
      { type: 'paragraph', html: '<code><a id="code-target"></a>Literal code.</code>' },
      { type: 'paragraph', html: '<a href="#heading-inner">Heading</a><a href="#dropped">Dropped</a><a href="#literal">Literal</a><a href="#code-target">Code</a>' }
    ];
    const result = normalizeDocumentContent(content, '', source);
    expect(hrefs(documentText(result[4], source))).toEqual(['heading-inner', 'dropped', 'literal', 'code-target'].map(id => source + '#' + id));
  });

  it('preserves explicit text, code fences and native PDF glyph strings exactly', () => {
    const code = '```html\n<a id="fake"></a> [source](#absent)\n```';
    const content = [
      { type: 'paragraph', format: 'text', text: '[source](#absent)' },
      { type: 'code', text: '<a href="#absent">literal</a>' },
      { type: 'paragraph', text: code },
      { type: 'paragraph', text: '[source](#absent)', pageNum: 1, lines: [{ items: [{ str: '[source](#absent)' }] }] },
      { type: 'table', cellFormat: 'text', rows: [['[source](#absent)']] }
    ];
    expect(normalizeDocumentContent(content, '', source)).toEqual(content);
  });

  it('reserves source identifiers before assigning stable generated heading identities', () => {
    const content = [
      { type: 'heading', level: 1, text: 'Field observations' },
      { type: 'paragraph', html: '<span id="heading-2">A retained source target.</span>' },
      { type: 'heading', level: 2, text: 'Results' },
      { type: 'paragraph', html: '<a href="#heading-2">Source marker</a>' }
    ];
    const result = normalizeDocumentContent(content, 'Field observations', source);
    expect(result.find(item => item.type === 'heading').id).toBe('heading-2-2');
    expect(hrefs(documentText(result.at(-1), source))).toEqual(['#heading-2']);
    const fb2 = normalizeDocumentContent(content, 'Field observations', source, { inlineFragmentTargets: false });
    expect(fb2.find(item => item.type === 'heading').id).toBe('heading-2-2');
    expect(hrefs(documentText(fb2.at(-1), source))).toEqual([source + '#heading-2']);
  });

  it('resolves outgoing references in reading metadata, blockquote aliases and rich captions without claiming their metadata IDs', () => {
    const content = [
      { type: 'heading', level: 2, html: '<a href="#missing">Results</a>' },
      { type: 'blockquote', html: '<a href="#missing">Quoted reference</a>' },
      { type: 'image', src: 'https://example.test/chart.png', caption: '<a href="#missing">Chart source</a>' },
      { type: 'subtitle', html: '<a href="#missing">Deck source</a>' }
    ];
    const before = structuredClone(content), result = normalizeDocumentContent(content, '', source);
    expect(hrefs(result[0].html)).toEqual([source + '#missing']);
    expect(hrefs(result[1].html)).toEqual([source + '#missing']);
    expect(hrefs(result[2].caption)).toEqual([source + '#missing']);
    expect(hrefs(result[3].html)).toEqual([source + '#missing']);
    expect(content).toEqual(before);
  });

  it('keeps native PDF caption glyphs literal', () => {
    const item = { type: 'image', src: 'https://example.test/chart.png', caption: '<a href="#missing">Literal caption</a>', pageNum: 1, lines: [{ items: [{ str: 'Literal caption' }] }] };
    expect(normalizeDocumentContent([item], '', source)[0]).toEqual(item);
  });
});
