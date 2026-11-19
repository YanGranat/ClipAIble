import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { normalizeDocumentContent } from '../../scripts/generation/document-content.js';

const sourceUrl = 'https://example.org/article?key=a%26b';
const title = 'Independent observations';
const body = () => ({ type: 'heading', level: 2, text: 'A body section' });
const link = id => ({ type: 'paragraph', html: `<a href="#${id}">Original source target</a>` });

describe('Original source ID reservation', () => {
  it('does not alias an omitted source owner to a generated body heading', () => {
    const document = new JSDOM(`<!doctype html><article><h1 id="heading-0">${title}</h1><h2>A body section</h2><p><a href="#heading-0">Original title reference</a></p></article>`).window.document;
    const content = [...document.querySelectorAll('h2,p')].map(node => node.tagName === 'H2' ?
      { type: 'heading', level: 2, text: node.textContent, format: 'text' } :
      { type: 'paragraph', html: node.innerHTML });
    const before = structuredClone(content);
    const result = normalizeDocumentContent(content, title, sourceUrl);
    expect(result[0].id).toBe('heading-0');
    const output = new JSDOM(result[1].html).window.document;
    expect(output.querySelector('a').getAttribute('href')).toBe(sourceUrl + '#heading-0');
    expect(content).toEqual(before);
  });

  it('reserves later authored identifiers when disambiguating duplicate heading IDs', () => {
    const content = [
      { type: 'heading', level: 2, text: 'First section', id: 'section' },
      { type: 'heading', level: 2, text: 'Second section', id: 'section' },
      { type: 'heading', level: 2, text: 'Authored suffix section', id: 'section-2' },
      { type: 'paragraph', html: '<span id="section-3">Authored inline target.</span><a href="#section">First ref</a><a href="#section-2">Suffix ref</a><a href="#section-3">Inline ref</a><a href="#section-4">Unowned ref</a>' }
    ];
    const before = structuredClone(content), result = normalizeDocumentContent(content, '', sourceUrl);
    expect(result.filter(item => item.type === 'heading').map(item => item.id)).toEqual(['section', 'section-4', 'section-2']);
    const links = [...new JSDOM(result[3].html).window.document.querySelectorAll('a')];
    expect(links.map(node => node.getAttribute('href'))).toEqual(['#section', '#section-2', '#section-3', sourceUrl + '#section-4']);
    expect(content).toEqual(before);
  });

  it('does not resurrect a removed title target as the next generated heading', () => {
    const content = [{ type: 'heading', level: 1, text: title, id: 'heading-1' }, body(), link('heading-1')];
    const before = structuredClone(content);
    const result = normalizeDocumentContent(content, title, sourceUrl);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'heading', text: 'A body section' });
    expect(result[0].id).not.toBe('heading-1');
    expect(result[1].html).toContain(`href="${sourceUrl.replace('&', '&amp;')}#heading-1"`);
    expect(content).toEqual(before);
  });

  it.each(['<span id="heading-1">Independent observations</span>', '<a name="heading-1">Independent observations</a>'])('reserves even an inline source target removed with the title: %s', markup => {
    const content = [{ type: 'heading', level: 1, html: markup }, body(), link('heading-1')];
    const result = normalizeDocumentContent(content, title, sourceUrl);
    expect(result[0].id).not.toBe('heading-1');
    expect(result[1].html).toContain(sourceUrl + '#heading-1');
  });

  it('reserves a paragraph owner removed by duplicate-figure normalization', () => {
    const src = 'https://example.org/figure.png';
    const content = [{ type: 'paragraph', id: 'heading-1', html: `<figure><img src="${src}"><figcaption>Measured result</figcaption></figure>` },
      { type: 'image', src, caption: 'Measured result' }, body(), link('heading-1')];
    const before = structuredClone(content);
    const result = normalizeDocumentContent(content, '', sourceUrl);
    expect(result.map(item => item.type)).toEqual(['image', 'heading', 'paragraph']);
    expect(result[1].id).not.toBe('heading-1');
    expect(result[2].html).toContain(sourceUrl + '#heading-1');
    expect(content).toEqual(before);
  });

  it.each([true, false])('reserves all original inline IDs independently of format reachability: %s', inlineFragmentTargets => {
    const content = [{ type: 'heading', level: 1, text: title },
      { type: 'table', cellFormat: 'html', headers: ['<span id="heading-2">Measurement</span>'], rows: [['1']] }, body(), link('heading-2'),
      { type: 'list', items: [{ html: 'A nested <em>item</em>', id: 'list-target' }] }];
    const before = structuredClone(content);
    const originalHeaders = content[1].headers;
    const originalRows = content[1].rows;
    const originalFirstRow = content[1].rows[0];
    const originalItems = content[4].items;
    const originalFirstItem = content[4].items[0];
    const result = normalizeDocumentContent(content, title, sourceUrl, { inlineFragmentTargets });
    expect(result.find(item => item.type === 'heading').id).not.toBe('heading-2');
    expect(result.find(item => item.type === 'paragraph').html).toContain(inlineFragmentTargets ? 'href="#heading-2"' : sourceUrl + '#heading-2');
    expect(content).toEqual(before);
    expect(content[1].headers).toBe(originalHeaders);
    expect(content[1].rows).toBe(originalRows);
    expect(content[1].rows[0]).toBe(originalFirstRow);
    expect(content[4].items).toBe(originalItems);
    expect(content[4].items[0]).toBe(originalFirstItem);
  });

  it.each([0, false])('reserves removed source IDs after the existing primitive text normalization: %s', value => {
    const content = [{ type: 'heading', level: 1, text: value, id: 'heading-1' }, body(), link('heading-1')];
    const result = normalizeDocumentContent(content, String(value), sourceUrl);
    expect(result[0].id).not.toBe('heading-1');
    expect(result[1].html).toContain(sourceUrl + '#heading-1');
    expect(content[0].text).toBe(value);
  });

  it.each([
    { type: 'paragraph', format: 'text', text: '<span id="heading-2">Literal text</span>' },
    { type: 'paragraph', html: '<code>&lt;span id="heading-2"&gt;Literal code&lt;/span&gt;</code>' },
    { type: 'table', cellFormat: 'text', headers: ['<span id="heading-2">Literal cell</span>'], rows: [['1']] }
  ])('does not reserve ID-looking literal content: %#', literal => {
    const content = [{ type: 'heading', level: 1, text: title }, literal, body()];
    const result = normalizeDocumentContent(content, title, sourceUrl);
    expect(result.find(item => item.type === 'heading').id).toBe('heading-2');
  });
});
