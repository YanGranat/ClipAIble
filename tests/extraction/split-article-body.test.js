import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { findMainContent } from '../../scripts/extraction/extractor/discover.js';
import { collectCandidateElements, filterCandidateElements, parseElements, sortElementsInDomOrder } from '../../scripts/extraction/extractor/parse.js';
import { isExcluded } from '../../scripts/extraction/extractor/filters.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';

const documents = [];
const constants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS, NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH };
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const paragraphs = Array.from({ length: 12 }, (_, index) => `<p>Observation ${index + 1}: ${'The study measures how tidal flow changes the distribution of nutrients throughout the harbor. '.repeat(6)}</p>`).join('');
const figure = '<figure><img src="/tides.png" width="640" height="480" alt="Tidal measurements"><figcaption>Tidal measurements across the harbor.</figcaption></figure>';
function extract(markup, title = 'Harbor Ecology Field Report') {
  const dom = new JSDOM(`<!doctype html><title>${title}</title>${markup}`, { url: 'https://example.com/report' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const before = dom.window.document.body.innerHTML;
  const root = findMainContent(dom.window, dom.window.document, element => isExcluded(dom.window, element, constants));
  const candidates = collectCandidateElements(root, dom.window);
  const state = { processedImages: new Set(), addedHeadings: new Set(), mainTitleText: '', standfirstElement: null, standfirstText: null, referenceRoots: [root], debugInfo: null };
  const result = parseElements(dom.window, sortElementsInDomOrder(filterCandidateElements(dom.window, candidates, constants, null, [root])), state, constants, dom.window.location.href);
  expect(dom.window.document.body.innerHTML).toBe(before);
  expect(dom.window.document.compatMode).toBe('CSS1Compat');
  return { root, result, candidates, text: result.map(item => item.text || item.caption || '').join('\n') };
}

describe('Split article bodies', () => {
  it('validates class-based article titles containing a dash before a site-title suffix', () => {
    const title = 'Harbor Ecology — Field Report';
    const { text, result } = extract(`<main><div class="post"><h1>${title}</h1><div class="post-content">${paragraphs}<aside>${figure}</aside></div><div class="post-content"><p>The final observation completes the study.</p></div></div></main>`, title + ' | Field Journal');
    expect(text).toContain('The final observation completes the study.');
    expect(result.filter(item => item.type === 'image')).toHaveLength(1);
  });
  it.each(['article', 'main', 'div class="post"'])('preserves all body blocks inside %s, including a short continuation and intervening figure', owner => {
    const tag = owner.split(' ')[0];
    const { text, result, candidates } = extract(`<main><${owner}><h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}</div>${figure}<div class="post-content"><h2>Measurements</h2><p>Salinity was measured at three depths.</p></div><div class="post-content"><p>The final observation completes the study.</p></div></${tag}></main>`);
    expect(text).toContain('Salinity was measured at three depths.');
    expect(text).toContain('The final observation completes the study.');
    expect(result.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.com/tides.png']);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(text.indexOf('Tidal measurements')).toBeLessThan(text.indexOf('Salinity was measured'));
  });

  it('keeps wrapper-owned introduction and epilogue around a nested body exactly once', () => {
    const { text } = extract(`<main><article><h1>Harbor Ecology Field Report</h1><div class="post-content"><p>The introduction defines the survey boundary.</p><div class="post-content">${paragraphs}</div><p>The epilogue closes the first observation group.</p></div><div class="post-content"><p>A short final continuation remains available.</p></div></article></main>`);
    for (const value of ['The introduction defines the survey boundary.', 'The epilogue closes the first observation group.', 'A short final continuation remains available.', 'Observation 7:']) expect(text.split(value)).toHaveLength(2);
  });

  it('preserves direct and inline text owned by body wrappers and a short final fragment', () => {
    const { text } = extract(`<article><h1>Harbor Ecology Field Report</h1><div class="post-content">Direct opening text <em>with inline emphasis.</em><div class="post-content">${paragraphs}</div>Direct closing text belongs to this block.</div><div class="post-content">Final observation remains important.</div></article>`);
    for (const value of ['Direct opening text', 'with inline emphasis.', 'Direct closing text belongs to this block.', 'Final observation remains important.', 'Observation 7:']) expect(text.split(value)).toHaveLength(2);
  });

  it.each(['nav', 'div class="comments"', 'div class="related-stories"', 'div class="advertisement"', 'div data-module="ad"'])('excludes same-class bodies and figures inside %s', noise => {
    const tag = noise.split(' ')[0];
    const { text, result } = extract(`<main><h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}</div><${noise}><div class="post-content"><p>UNRELATED PANEL CONTENT MUST STAY OUT.</p><figure><img src="/panel.png" width="640" height="480"></figure></div></${tag}><div class="post-content"><p>The final observation completes the study.</p></div></main>`);
    expect(text).toContain('The final observation completes the study.');
    expect(text).not.toContain('UNRELATED PANEL');
    expect(result.filter(item => item.type === 'image')).toHaveLength(0);
  });

  it('does not merge continuations belonging to another article or class owner', () => {
    const { root, text } = extract(`<main><article id="reading-owner"><h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}</div><div class="post-content"><p>The final observation completes the study.</p></div><nav aria-label="Related articles"><article><div class="post-content"><p>ANOTHER ARTICLE CONTENT MUST STAY OUT.</p></div></article></nav></article><article><p>SIBLING ARTICLE CONTENT MUST STAY OUT.</p></article><div class="post"><h1>Another Field Report</h1><div class="post-content"><p>ANOTHER POST CONTENT MUST STAY OUT.</p></div></div></main>`);
    expect(root.id).toBe('reading-owner');
    expect(text).toContain('The final observation completes the study.');
    expect(text).not.toContain('ANOTHER ARTICLE');
    expect(text).not.toContain('ANOTHER POST');
    expect(text).not.toContain('SIBLING ARTICLE');
  });

  it('keeps main-page commentary outside a validated class-based article owner', () => {
    const { text, result } = extract(`<main><div class="post"><h1>Harbor Ecology Field Report</h1><div class="post__content wysiwyg">${paragraphs}</div>${figure}<div class="post__content wysiwyg"><p>The final observation completes the study.</p></div></div><div class="comments"><div class="post__content wysiwyg"><p>READER COMMENTARY MUST STAY OUT.</p></div></div><nav><p>UNUSUAL NAVIGATION MUST STAY OUT.</p></nav></main>`);
    expect(text).toContain('The final observation completes the study.');
    expect(text).not.toContain('MUST STAY OUT');
    expect(result.filter(item => item.type === 'image')).toHaveLength(1);
  });

  it('preserves article-owned figures before and after class-based body blocks', () => {
    const image = marker => `<figure><img src="/${marker}.png" width="640" height="480"></figure>`;
    const { result } = extract(`<article><h1>Harbor Ecology Field Report</h1>${image('before')}<div class="post-content">${paragraphs}</div>${figure}<div class="post-content"><p>The final observation completes the study.</p></div>${image('after')}</article>`);
    expect(result.filter(item => item.type === 'image').map(item => item.src)).toEqual([
      'https://example.com/before.png', 'https://example.com/tides.png', 'https://example.com/after.png'
    ]);
    const position = value => result.findIndex(item => (item.src || item.text || '').includes(value));
    expect(position('before.png')).toBeLessThan(position('Observation 1:'));
    expect(position('Observation 12:')).toBeLessThan(position('tides.png'));
    expect(position('tides.png')).toBeLessThan(position('The final observation'));
    expect(position('The final observation')).toBeLessThan(position('after.png'));
  });

  it('preserves an article aside with its direct text, paragraph, and illustration', () => {
    const { text, result } = extract(`<article><h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}<aside>Authored direct aside text.<p>Authored aside paragraph.</p>${figure}</aside></div><div class="post-content"><p>The final observation completes the study.</p></div></article>`);
    expect(result.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.com/tides.png']);
    expect(text).toContain('Tidal measurements across the harbor.');
    expect(text).toContain('Authored direct aside text.');
    expect(text).toContain('Authored aside paragraph.');
  });

  it('emits a layout illustration caption and credit exactly once when both contain paragraphs', () => {
    const captioned = '<figure><img src="/tides.png" width="640" height="480"><figcaption><p>The survey shows tidal measurements across the harbor.</p><p>Field Survey Archive</p></figcaption></figure>';
    const { result } = extract(`<article><h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}<aside>${captioned}</aside></div><div class="post-content"><p>The final observation completes the study.</p></div></article>`);
    const serialized = JSON.stringify(result);
    expect(serialized.match(/The survey shows tidal measurements across the harbor\./g)).toHaveLength(1);
    expect(serialized.match(/Field Survey Archive/g)).toHaveLength(1);
  });

  it.each(['author-bio', 'comments', 'advertisement', 'nav'])('does not admit aside illustrations from %s', kind => {
    const panel = kind === 'nav' ? `<nav><aside>${figure}</aside></nav>` : `<aside class="${kind}">${figure}</aside>`;
    const { result } = extract(`<article>${panel}<h1>Harbor Ecology Field Report</h1><div class="post-content">${paragraphs}${panel}</div><div class="post-content"><p>The final observation completes the study.</p></div>${panel}</article>`);
    expect(result.filter(item => item.type === 'image')).toHaveLength(0);
  });

  it('executes the serialized extractor with its split-body dependencies in page context', async () => {
    const dom = new JSDOM(`<!doctype html><title>Harbor Ecology Field Report</title><main><h1>Harbor Ecology Field Report</h1><div class="wysiwyg">${paragraphs}</div>${figure}<div class="wysiwyg"><p>The final observation completes the study.</p></div></main>`, { url: 'https://example.com/report', runScripts: 'outside-only' });
    documents.push(dom);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract('https://example.com/report');
    expect(result.content.some(item => item.text?.includes('The final observation completes the study.'))).toBe(true);
    expect(result.content.some(item => item.type === 'image' && item.src === 'https://example.com/tides.png')).toBe(true);
  });
});
