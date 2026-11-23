import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { prepareExtractedMainTitle } from '../../scripts/extraction/html-utils.js';
import { prepareDocumentContent } from '../../scripts/generation/document-content.js';

const normalizeDocumentContent = (...args) => prepareDocumentContent(...args).content;
const removeExtractedMainTitle = (...args) => prepareExtractedMainTitle(...args).content;

const title = 'Independent measurements';
const heading = () => ({ type: 'heading', level: 1, text: title, html: '<em>Independent</em> measurements' });
const paragraph = { type: 'paragraph', html: 'An independently authored observation.' };

describe('Source-witnessed extracted title ownership', () => {
  it('derives title targets from the source even if the response omits the main heading', () => {
    const html = '<article><h1 id="reading-cover"><span id="measure%26ments">Independent</span> measurements<a name="older-cover"></a><span hidden id="hidden-target">hidden</span></h1><p>Reading text.</p></article>';
    expect(prepareExtractedMainTitle([paragraph], title, html)).toEqual({ content: [paragraph], titleFragmentIds: ['reading-cover', 'measure%26ments', 'older-cover'] });
    const content = [{ ...heading(), id: 'model-created' }, paragraph];
    expect(prepareExtractedMainTitle(content, title, html)).toEqual({ content: [paragraph], titleFragmentIds: ['reading-cover', 'measure%26ments', 'older-cover'] });
  });

  it('removes one actual article H1 even after publisher metadata, preserving every other item', () => {
    const leading = [{ type: 'paragraph', text: 'Published on: April 12, 2031' }, { type: 'paragraph', text: '7 min read' }];
    const later = { type: 'heading', level: 2, text: title };
    const content = [...leading, heading(), paragraph, later];
    const before = structuredClone(content);
    expect(removeExtractedMainTitle(content, title, '<article><h1><strong>Independent</strong> measurements</h1><p>An independently authored observation.</p><h2>Independent measurements</h2></article>')).toEqual([...leading, paragraph, later]);
    expect(content).toEqual(before);
  });

  it.each([1, 2])('preserves ambiguous source headings with %s returned copies', returned => {
    const content = Array.from({ length: returned }, heading);
    expect(removeExtractedMainTitle(content, title, '<h1>Independent measurements</h1><h1>Independent measurements</h1>')).toBe(content);
  });

  it('preserves two returned H1 copies when their source ownership is ambiguous', () => {
    const content = [heading(), paragraph, heading()];
    expect(removeExtractedMainTitle(content, title, '<h1>Independent measurements</h1>')).toBe(content);
  });

  it.each(['source-title', 'heading-1', '測定&values'])('keeps an authored header target that metadata cannot represent: %s', id => {
    const source = { ...heading(), id };
    const link = { type: 'paragraph', html: `<a href="#${encodeURIComponent(id)}">Header reference</a>` };
    const content = [{ type: 'paragraph', html: 'Publisher metadata.' }, source, { type: 'heading', level: 2, text: 'Body section' }, link];
    const result = removeExtractedMainTitle(content, title, '<h1>Independent measurements</h1>');
    expect(result).toBe(content);
    const normalized = normalizeDocumentContent(result, title, 'https://example.org/article');
    const owner = normalized.find(item => item.id === id);
    expect(owner).toMatchObject({ type: 'heading', level: 1, text: title });
    expect(normalized.find(item => item.text === 'Body section').id).not.toBe(id);
    expect(normalized.at(-1).html).toContain(`href="#${encodeURIComponent(id)}"`);
  });

  it.each(['<span id="source-title">Independent measurements</span>', '<a name="source-title">Independent measurements</a>', '<sup id="note-reference">Independent measurements</sup>'])('keeps actual inline targets inside the returned rich H1: %s', markup => {
    const content = [{ ...heading(), html: markup }, paragraph];
    expect(removeExtractedMainTitle(content, title, '<h1>Independent measurements</h1>')).toBe(content);
  });

  it('does not mistake literal code spelling for an authored inline target', () => {
    const literalTitle = 'Literal <span id="source-title">token</span>';
    const content = [{ type: 'heading', level: 1, format: 'text', text: literalTitle }, paragraph];
    expect(removeExtractedMainTitle(content, literalTitle, '<h1>Literal &lt;span id="source-title"&gt;token&lt;/span&gt;</h1>')).toEqual([paragraph]);
  });

  it('preserves another real level-one heading and does not match only case or a substring', () => {
    const other = { type: 'heading', level: 1, text: 'A later independent section' };
    expect(removeExtractedMainTitle([heading(), other], title, '<h1>Independent measurements</h1><h1>A later independent section</h1>')).toEqual([other]);
    expect(removeExtractedMainTitle([heading()], 'Independent', '<h1>Independent measurements</h1>')).toHaveLength(1);
    expect(removeExtractedMainTitle([heading()], title.toUpperCase(), '<h1>Independent measurements</h1>')).toHaveLength(1);
    expect(removeExtractedMainTitle([{ ...heading(), level: 2 }], title, '<h1>Independent measurements</h1>')).toHaveLength(1);
  });

  it.each(['head', 'script', 'style', 'template', 'pre', 'code', 'textarea', 'samp', 'kbd', 'xmp', 'plaintext', 'noscript'])('does not use an H1 inside %s as article-header evidence', tag => {
    const content = [heading(), paragraph];
    expect(removeExtractedMainTitle(content, title, `<${tag}><h1>Independent measurements</h1></${tag}><p>Reading content.</p>`)).toBe(content);
  });

  it.each(['hidden', 'aria-hidden="true"', 'style="display: none !important"', 'style="visibility:hidden"'])('ignores explicitly non-reading source ancestors: %s', attr => {
    const content = [heading()];
    expect(removeExtractedMainTitle(content, title, `<div ${attr}><h1>Independent measurements</h1></div>`)).toBe(content);
  });

  it('keeps an ambiguous real second H1 when duplicate attributes make its first value visible', () => {
    const content = [heading()];
    const html = '<h1>Independent measurements</h1><div aria-hidden="false" aria-hidden="true"><h1>Independent measurements</h1></div>';
    expect(removeExtractedMainTitle(content, title, html)).toBe(content);
  });

  it('reads inline code/formatting and entities as source heading text without parsing literal title text as tags', () => {
    const literalTitle = 'Array<T> & values';
    const content = [{ type: 'heading', level: 1, format: 'text', text: literalTitle }, paragraph];
    expect(removeExtractedMainTitle(content, literalTitle, '<h1><code>Array&lt;T&gt;</code> &amp; <em>values</em></h1>')).toEqual([paragraph]);
  });

  it('ignores source comments and hidden heading children without deleting visible prose', () => {
    const content = [heading(), { type: 'paragraph', text: 'Published observations are ordinary authored prose.' }];
    const html = '<!-- <h1>Independent measurements</h1> --><h1>Independent <span hidden>navigation</span><em>measurements</em></h1>';
    expect(removeExtractedMainTitle(content, title, html)).toEqual([content[1]]);
  });

  it('does not interpret a closing plaintext spelling as a return to HTML markup', () => {
    const content = [heading()];
    expect(removeExtractedMainTitle(content, title, '<plaintext>Example text.</plaintext><h1>Independent measurements</h1>')).toBe(content);
  });

  it.each([2, 3, 4, 5, 6])('does not join heading text across a browser-implied H1 boundary before H%s', level => {
    const source = `<!doctype html><h1>Independent<h${level}> measurements</h${level}></h1>`;
    const dom = new JSDOM(source);
    try {
      expect(dom.window.document.compatMode).toBe('CSS1Compat');
      expect(dom.window.document.querySelector('h1').textContent).toBe('Independent');
      const content = [heading(), paragraph];
      expect(removeExtractedMainTitle(content, title, source)).toBe(content);
    } finally { dom.window.close(); }
  });

  it.each(['', '<h1>Different title</h1>', '<h1>Independent measurements', '<div><h1>Independent measurements</div>', '<h1>Independent <h1>measurements</h1></h1>'])('preserves content without an unambiguous completed source header: %s', html => {
    const content = [heading(), paragraph];
    expect(removeExtractedMainTitle(content, title, html)).toBe(content);
  });
});
