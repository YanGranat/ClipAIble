import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { deduplicateContent } from '../../scripts/extraction/html-utils.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { isExcluded, isIcon } from '../../scripts/extraction/extractor/filters.js';
import { isDecorativeImage, isTrackingPixel, extractBestImageUrl } from '../../scripts/extraction/extractor/images.js';
import { extractStandfirst } from '../../scripts/extraction/extractor/standfirst.js';
import { findMainContent } from '../../scripts/extraction/extractor/discover.js';
import { collectCandidateElements, parseElements, handleTable } from '../../scripts/extraction/extractor/parse.js';

const windows = [];
const constants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS, NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH };
function page(markup) {
  const dom = new JSDOM(`<article>${markup}</article>`, { url: 'https://example.test/studies/one' });
  windows.push(dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  return dom.window;
}
function extract(markup) {
  const win = page(markup);
  const state = { processedImages: new Set(), addedHeadings: new Set(), addedParagraphs: new Set(), mainTitleText: '', standfirstElement: null, standfirstText: null, debugInfo: null };
  const root = win.document.querySelector('article');
  return parseElements(win, collectCandidateElements(root, win), state, constants, win.location.href);
}
afterEach(() => {
  for (const win of windows.splice(0)) win.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Semantic article content', () => {
  it('selects the strongest article instead of the first qualifying teaser', () => {
    const win = page(`<article id="teaser"><p>${'A short overview introduces another story. '.repeat(16)}</p></article><article id="body">${Array.from({ length: 12 }, (_, i) => `<p>Observation ${i} explains the method and the measured response in sufficient detail. ${'The independent analysis includes repeated samples and explicit controls. '.repeat(4)}</p>`).join('')}</article>`);
    const container = win.document.querySelector('article');
    container.replaceWith(...container.childNodes);
    expect(findMainContent(win, win.document, element => isExcluded(win, element, constants), null, () => {}).id).toBe('body');
  });
  it('retains structural blocks and headings belonging to different sections', () => {
    const content = [
      { type: 'heading', text: 'Parameters', level: 2 },
      { type: 'paragraph', text: 'The first experiment uses a narrow range.' },
      { type: 'table', headers: ['Depth', 'Temperature'], rows: [['2', '18']] },
      { type: 'separator' },
      { type: 'infobox_start' },
      { type: 'heading', text: 'Parameters', level: 2 },
      { type: 'paragraph', text: 'The second experiment uses a wider range.' },
      { type: 'infobox_end' }
    ];
    expect(deduplicateContent(content)).toEqual(content);
  });

  it.each(['pre', 'blockquote', 'ul'])('preserves navigation words inside %s content', tag => {
    const text = 'Read more records from the database, then sign up another observer and compare the next: measurement. '.repeat(4);
    const win = page(`<${tag}>${tag === 'ul' ? `<li>${text}</li>` : text}</${tag}>`);
    expect(isExcluded(win, win.document.querySelector(tag), constants)).toBe(false);
  });

  it.each(['comments', 'related-stories'])('inherits a %s exclusion from an ancestor', className => {
    const win = page(`<section class="${className}"><p>A long reader response belongs to the surrounding panel.</p></section>`);
    expect(isExcluded(win, win.document.querySelector('p'), constants)).toBe(true);
  });

  it('excludes footer descendants but keeps text waiting for a fade animation', () => {
    const win = page('<footer><p>Footer navigation for the publication.</p></footer><p class="fade" style="opacity:0">A real observation is temporarily transparent during the page transition.</p>');
    expect(isExcluded(win, win.document.querySelector('footer p'), constants)).toBe(true);
    expect(isExcluded(win, win.document.querySelector('.fade'), constants)).toBe(false);
  });

  it('does not interpret ordinary class-name substrings as icons', () => {
    const win = page('<p><span class="lexicon">Scientific vocabulary</span> helps describe the results.</p>');
    expect(isIcon(win.document.querySelector('span'))).toBe(false);
  });

  it.each(['/sites/default/files/clear-water.png', '/user/brand-study/pixel-art.png'])('keeps a full-size source illustration at %s', src => {
    const win = page(`<img src="${src}" width="640" height="480" alt="Measurements across the sample">`);
    const img = win.document.querySelector('img');
    expect(isDecorativeImage(win, img, constants.LOGO_PATTERNS)).toBe(false);
    expect(isTrackingPixel(win, img)).toBe(false);
  });

  it('prefers a deferred source over a transparent loading pixel', () => {
    const win = page('<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="/sample.png" width="640" height="480">');
    expect(extractBestImageUrl(win.document.querySelector('img'))).toBe('/sample.png');
  });

  it('uses a full deferred source when a preview URL is already present', () => {
    const win = page('<img src="/preview.jpg" data-src="/full.png" width="640" height="480">');
    expect(extractBestImageUrl(win.document.querySelector('img'))).toBe('/full.png');
  });

  it.each([
    'Precise measurements reveal the effect of seasonal changes in the surrounding water.',
    'Измерения показывают, как меняются свойства воды в течение всего исследуемого периода.',
    'Messungen zeigen, wie sich die Eigenschaften des Wassers während des gesamten Versuchs verändern.'
  ])('keeps an unmarked opening paragraph in the article body', text => {
    const win = page(`<p>${text}</p>`);
    expect(extractStandfirst(win.document.querySelector('article'))).toEqual({ text: null, element: null });
  });

  it('keeps the body after a middle section named Notes and repeated headings', () => {
    const content = extract('<h2>Parameters</h2><p>The first procedure measures temperature.</p><h2>Notes</h2><p>The observations require careful interpretation.</p><h2>Parameters</h2><p>The second procedure measures pressure.</p>');
    expect(content.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['Parameters', 'Notes', 'Parameters']);
    expect(content.some(item => item.text?.includes('The second procedure'))).toBe(true);
  });

  it('preserves a restored plain-text generic expression as visible text', () => {
    const content = extract('<p data-original-text="Use Array&lt;T&gt; values in the calculation.">Translated sample text.</p>');
    expect(content[0].html).toBe('Use Array&lt;T&gt; values in the calculation.');
  });

  it('retains an article separator between two paragraphs', () => {
    const content = extract('<p>The first observation completes this section.</p><hr><p>The second observation starts a separate section.</p>');
    expect(content.map(item => item.type)).toEqual(['paragraph', 'separator', 'paragraph']);
  });

  it('represents a short data table as cells without treating row labels as column headers', () => {
    const win = page('<table><tr><th>A</th><td>1</td></tr><tr><th>B</th><td>2</td></tr></table>');
    const item = handleTable(win.document.querySelector('table'));
    expect(item?.type).toBe('table');
    expect(item.cellFormat).toBe('html');
    expect(item.hasHeaders).toBe(false);
    expect(item.rows).toEqual([['A', '1'], ['B', '2']]);
    expect(item.headers || []).toEqual([]);
  });

  it('keeps multiple images inside a figure and an inline paragraph', () => {
    const content = extract('<p>The first image <img src="/a.png" width="640" height="480"> supports the observation.</p><figure><img src="/b.png" width="640" height="480"><img src="/c.png" width="640" height="480"><figcaption>Two independent sample views.</figcaption></figure>');
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/a.png', 'https://example.test/b.png', 'https://example.test/c.png']);
    expect(content.map(item => item.text || '').join(' ')).toContain('supports the observation');
  });

  it('retains nested list structure and inline emphasis', () => {
    const content = extract('<ul><li><strong>First stage</strong><ul><li>Nested observation</li></ul></li><li>Second stage</li></ul>');
    const lists = content.filter(item => item.type === 'list');
    expect(lists).toHaveLength(1);
    expect(lists[0].items).toHaveLength(2);
    expect(lists[0].items[0].html).toContain('<strong>First stage</strong>');
    expect(lists[0].items[0].html).toContain('<ul><li>Nested observation</li></ul>');
  });

  it('preserves the order of images, code, tables and captions inside one figure', () => {
    const content = extract('<figure><img src="/first.png" width="640" height="480"><pre><code>const measured = 42;</code></pre><table><tr><td>Sample A</td><td>42</td></tr></table><img src="/last.png" width="640" height="480"><figcaption>Independent measurements.</figcaption></figure>');
    expect(content.map(item => item.type)).toEqual(['image', 'code', 'table', 'image', 'paragraph']);
    expect(content[1].text).toBe('const measured = 42;');
    expect(content[2].rows).toEqual([['Sample A', '42']]);
    expect(content.at(-1).text).toBe('Independent measurements.');
  });

  it('preserves the caption of a figure containing a table without images', () => {
    const content = extract('<figure><table><tr><td>Sample B</td><td>17</td></tr></table><figcaption>Observed results.</figcaption></figure>');
    expect(content.map(item => item.type)).toEqual(['table', 'paragraph']);
    expect(content[0].rows).toEqual([['Sample B', '17']]);
    expect(content[1].text).toBe('Observed results.');
  });
});
