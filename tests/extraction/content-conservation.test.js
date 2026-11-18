import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseElements, filterCandidateElements } from '../../scripts/extraction/extractor/parse.js';
import { cleanHeadingText, stripObjMarkers } from '../../scripts/extraction/extractor/text-utils.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { deduplicateContent, filterExtractionNoise } from '../../scripts/extraction/html-utils.js';
import { extractUltimateFallbackAllParagraphs } from '../../scripts/extraction/extractor/fallbacks.js';
import { isDecorativeImage, isTrackingPixel } from '../../scripts/extraction/extractor/images.js';

const documents = [];
const extractionConstants = { ...CONSTANTS,
  NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS,
  NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH
};
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function parse(html, parser = parseElements, filter = false) {
  const dom = new JSDOM(`<main>${html}</main>`, { url: 'https://example.com/article' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const main = dom.window.document.querySelector('main');
  const before = main.innerHTML;
  const selected = Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,img,figure,blockquote,pre,code,ul,ol,table,div'));
  const state = { processedImages: new Set(), addedHeadings: new Set(), addedParagraphs: new Set(), mainTitleText: '', standfirstElement: null, standfirstText: null, debugInfo: null };
  const candidates = filter ? filterCandidateElements(dom.window, selected, extractionConstants, null) : selected;
  const result = parser(dom.window, candidates, state, extractionConstants, dom.window.location.href);
  expect(main.innerHTML).toBe(before);
  return { result, document: dom.window.document };
}

function text(document, item) {
  const node = document.createElement('div');
  node.innerHTML = item.type === 'list' ? item.items.map(value => typeof value === 'string' ? value : value.html || value.text || '').join(' ') : item.text || '';
  return node.textContent.replace(/\s+/g, ' ').trim();
}

describe('Article content conservation', () => {
  it('preserves independently owned repeated DOM quotations while retaining chunk-overlap deduplication', () => {
    const quote = { type: 'quote', text: 'A field measurement is useful only when its method is clear.' };
    const prose = { type: 'paragraph', text: 'The conclusion returns to the earlier quotation.' };
    const content = [quote, prose, { ...quote }, { ...prose }];
    expect(deduplicateContent(content, { preserveQuoteOccurrences: true })).toEqual([quote, prose, quote]);
    expect(deduplicateContent(content)).toEqual([quote, prose]);
  });
  it('keeps distinct equal-length content even when a short hash would collide', () => {
    const first = { type: 'paragraph', text: 'The example includes Aa in this position.' };
    const second = { type: 'paragraph', text: 'The example includes B@ in this position.' };
    expect(deduplicateContent([first, second, { ...first }])).toEqual([first, second]);
  });

  it('preserves article paragraphs that discuss section titles', () => {
    const paragraph = { type: 'paragraph', text: 'Стратегия исследования описана в разделе Дорожная карта. Направления научного поиска определяют последовательность экспериментов.' };
    const heading = { type: 'heading', text: 'Research plan' };
    expect(filterExtractionNoise([heading, paragraph, { type: 'heading', text: '2' }])).toEqual([heading, paragraph]);
  });

  it('preserves ordinary object words and literal format names', () => {
    for (const value of ['OBJECTS IN DATA', 'OBJECTIVE AND OBJECTIONS', 'Wavefront OBJ files', '[OBJ] format']) {
      expect(cleanHeadingText(value)).toBe(value);
      expect(stripObjMarkers(value)).toBe(value);
    }
    expect(cleanHeadingText('A\uFFFC heading #')).toBe('A heading');
    expect(stripObjMarkers('A\uFFFC heading')).toBe('A heading');
  });

  it('keeps distinct headings whose ordinary words differ', () => {
    const headings = ['Objective', 'ective', 'Objects', 'ects'];
    const { result } = parse(headings.map(text => `<h2>${text}</h2>`).join(''));
    expect(result.map(item => item.text)).toEqual(headings);
  });

  it('preserves interleaved heading and paragraph order in the final fallback', () => {
    const dom = new JSDOM('<h2>First section</h2><p>The first paragraph explains its section.</p><h2>Second section</h2><p>The second paragraph follows its heading.</p>');
    documents.push(dom);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('document', dom.window.document);
    const state = { mainTitleText: '', addedHeadings: new Set() };
    const result = extractUltimateFallbackAllParagraphs(dom.window, dom.window.document, state, extractionConstants);
    expect(result.map(item => item.text)).toEqual([
      'First section', 'The first paragraph explains its section.', 'Second section', 'The second paragraph follows its heading.'
    ]);
  });

  it.each(['data:image/png;base64,iVBORw0KGgo', 'data:image/gif;base64,R0lGODlh'])
    ('keeps a full-size embedded image and still detects a tracking pixel: %s', source => {
      const dom = new JSDOM('<img alt="A diagram">');
      documents.push(dom);
      const image = dom.window.document.querySelector('img');
      image.src = source;
      Object.defineProperties(image, { naturalWidth: { value: 600, configurable: true }, naturalHeight: { value: 400, configurable: true } });
      expect(isDecorativeImage(dom.window, image, CONSTANTS.LOGO_PATTERNS)).toBe(false);
      expect(isTrackingPixel(dom.window, image)).toBe(false);
      Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
      expect(isTrackingPixel(dom.window, image)).toBe(true);
    });

  it.each([
    ['https://example.com/image?id=first', 'https://example.com/image?id=second'],
    ['https://example.com/diagram.svg#first-view', 'https://example.com/diagram.svg#second-view']
  ])('keeps distinct image URL identities while removing exact duplicates', (first, second) => {
    const { result } = parse([first, second, first].map((source, index) =>
      `<img src="${source}" width="600" height="400" alt="Diagram ${index + 1}">`
    ).join(''));
    expect(result.filter(item => item.type === 'image').map(item => item.src)).toEqual([first, second]);
  });

  it('extracts nested prose and headings exactly once', () => {
    const { result, document } = parse('<div><div><p>The first paragraph contains useful detail.</p><h2>Another section</h2><p>The last paragraph finishes the article.</p></div></div>');
    expect(result.map(item => text(document, item))).toEqual([
      'The first paragraph contains useful detail.', 'Another section', 'The last paragraph finishes the article.'
    ]);
  });

  it('preserves direct text and inline wrappers around nested blocks in DOM order', () => {
    const { result, document } = parse('<div>Leading <strong>important text <p>A nested paragraph has sufficient detail.</p>more inline text</strong><section><div><p>A deeper paragraph remains in its place.</p></div></section> trailing.</div>');
    expect(result.map(item => text(document, item))).toEqual([
      'Leading important text', 'A nested paragraph has sufficient detail.', 'more inline text',
      'A deeper paragraph remains in its place.', 'trailing.'
    ]);
    expect(result[0].html).toContain('<strong>important text </strong>');
    expect(result[2].html).toContain('<strong>more inline text</strong>');
  });

  it('does not copy a rejected descendant back through a parent fragment', () => {
    const { result, document } = parse('<div>Text before a nested block.<div class="advertisement"><p>Unwanted promotional material.</p></div><p>The article paragraph remains intact.</p>After.</div>', parseElements, true);
    expect(result.map(item => text(document, item))).toEqual([
      'Text before a nested block.', 'The article paragraph remains intact.', 'After.'
    ]);
  });

  it('preserves original text on an owning translated container once', () => {
    const { result, document } = parse('<div data-original-text="The complete original source text."><p>The translated first paragraph has enough detail.</p><p>The translated second paragraph has enough detail.</p></div>');
    expect(result.map(item => text(document, item))).toEqual(['The complete original source text.']);
  });

  it('restores translated inline fragments without copying the entire container', () => {
    const { result, document } = parse('<div>Introductory <em data-original-text="original words">translated words</em> before.<p>The nested paragraph remains in the same position.</p>After.</div>');
    expect(result.map(item => text(document, item))).toEqual([
      'Introductory original words before.', 'The nested paragraph remains in the same position.', 'After.'
    ]);
    expect(result[0].html).toContain('original words</em>');
  });

  it('keeps inline code inside a prose owner and a separate pre block once', () => {
    const { result, document } = parse('<div>Use <code>value()</code> in this introductory explanation.<p>Another <code>sample()</code> is shown here.</p><pre><code>const answer = 42;</code></pre>Final words.</div>');
    expect(result.map(item => text(document, item))).toEqual([
      'Use value() in this introductory explanation.', 'Another sample() is shown here.', 'const answer = 42;', 'Final words.'
    ]);
    expect(result.map(item => item.type)).toEqual(['paragraph', 'paragraph', 'code', 'paragraph']);
  });

  it('emits quote and nested list contents once', () => {
    const { result, document } = parse('<div><blockquote><div><p>A quoted paragraph remains together.</p></div></blockquote><ul><li>Outer item <ul><li>Nested item</li></ul> final words</li><li>Second item</li></ul></div>');
    expect(result.map(item => text(document, item))).toEqual([
      'A quoted paragraph remains together.', 'Outer item Nested item final words Second item'
    ]);
    expect(result.map(item => item.type)).toEqual(['quote', 'list']);
  });

  it('preserves references and trailing prose inside the article wrapper', () => {
    const { result, document } = parse('<div><p>The article ends before its reference section.</p><h2>References</h2><p>This reference remains outside article extraction.</p>Trailing reference text.</div>');
    expect(result.map(item => text(document, item))).toEqual([
      'The article ends before its reference section.', 'References',
      'This reference remains outside article extraction.', 'Trailing reference text.'
    ]);
  });

  it('runs the same partition logic when helpers are inlined', () => {
    const helpers = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import { buildCompleteInlinedFunction } from './scripts/extraction/extractor/builder.js'; process.stdout.write(buildCompleteInlinedFunction());"
    ], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const inlined = new Function(`${helpers}\nreturn parseElements;`)();
    const { result, document } = parse('<div>Text before the block.<p>The block text is included once.</p>After.</div>', inlined);
    expect(result.map(item => text(document, item))).toEqual(['Text before the block.', 'The block text is included once.', 'After.']);
  });
});
