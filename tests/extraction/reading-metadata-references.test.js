import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { extractMetadata } from '../../scripts/extraction/extractor/metadata.js';
import { readSelectedText } from '../../scripts/extraction/extractor/selectors.js';
import { handleParagraph, sanitizeParagraphHtml } from '../../scripts/extraction/extractor/parse.js';
import { CONSTANTS, NAVIGATION_PATTERNS } from '../../scripts/extraction/extractor/constants.js';
import { listHtml } from '../../scripts/generation/document-content.js';

const documents = [];
const constants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: NAVIGATION_PATTERNS.contains, NAV_PATTERNS_STARTS_WITH: NAVIGATION_PATTERNS.startsWith };
let serializedExtractor;
beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serializedExtractor = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
function page(html) {
  const dom = new JSDOM(`<!doctype html>${html}`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('Node', dom.window.Node); return dom;
}
async function extract(dom) {
  vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
  dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
  return dom.window.extract(dom.window.location.href, false, { content: 'article', title: 'h1' });
}
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Reading metadata and source references', () => {
  const noteText = 'The instrument was recalibrated before the survey.';
  const notes = `<article><h1>Field observations<sup id="ref-title"><a href="#note-title" data-footnote-ref="true">1</a><span aria-hidden="true"><sup>1</sup>The title follows the field notebook.</span></sup></h1><p id="summary">The measured interval<sup id="ref-body"><a href="#note-body" role="doc-noteref">2</a><span aria-hidden="true"><sup>2</sup>${noteText}</span></sup> remained stable.</p><ol><li id="note-title"><sup>1</sup>The title follows the field notebook.<a role="doc-backlink" href="#ref-title">↩︎</a></li><li id="note-body"><sup>2</sup>${noteText}<a role="doc-backlink" href="#ref-body">↩︎</a></li></ol></article>`;

  it('reads a plain title without a note marker or hidden tooltip while keeping the source unchanged', () => {
    const dom = page(notes), before = dom.window.document.body.innerHTML;
    expect(extractMetadata(dom.window.document, dom.window.location.href).title).toBe('Field observations');
    expect(readSelectedText(dom.window.document, 'h1')).toBe('Field observations');
    expect(dom.window.document.body.innerHTML).toBe(before);
  });

  it('preserves working references, paragraph identity and canonical list-item targets', async () => {
    const dom = page(notes), before = dom.window.document.body.innerHTML;
    const result = await extract(dom);
    expect(result.title).toBe('Field observations');
    expect(result.content.filter(item => item.type === 'heading' && item.level === 1)).toEqual([]);
    const paragraph = result.content.find(item => item.type === 'paragraph');
    expect(paragraph.id).toBe('summary');
    const restored = dom.window.document.createElement('div'); restored.innerHTML = paragraph.html;
    expect(restored.querySelector('a')?.getAttribute('href')).toBe('#note-body');
    expect(restored.querySelector('sup')?.id).toBe('ref-body');
    expect(restored.textContent).toBe('The measured interval2 remained stable.');
    expect(restored.querySelector('[aria-hidden="true"]')).toBeNull();
    const list = result.content.find(item => item.type === 'list');
    expect(list.items.map(item => item.id)).toEqual(['note-title', 'note-body']);
    restored.innerHTML = listHtml(list, dom.window.location.href);
    expect(restored.querySelector('#note-body')?.textContent).toContain(noteText);
    expect(dom.window.document.body.innerHTML).toBe(before);
  });

  it('retains a hidden annotation when there is no canonical duplicate target', () => {
    const dom = page('<p>A measurement<sup><a href="#absent" data-footnote-ref="true">3</a><span aria-hidden="true">A unique explanatory note.</span></sup> follows.</p>');
    expect(sanitizeParagraphHtml(dom.window.document.querySelector('p'))).toContain('A unique explanatory note.');
  });

  it('retains an inline annotation when its canonical target is outside the selected or allowed scope', async () => {
    const dom = page(`<article id="reading"><h1>Field observations</h1><p>A measurement<sup><a href="#separate-note" data-footnote-ref="true">3</a><span aria-hidden="true">${noteText}</span></sup> follows.</p></article><ol><li id="separate-note">${noteText}</li></ol>`);
    const before = dom.window.document.body.innerHTML;
    dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: '#reading' });
    expect(result.content.find(item => item.type === 'paragraph')?.text).toContain(noteText);
    expect(dom.window.document.body.innerHTML).toBe(before);
    const paragraph = dom.window.document.querySelector('p');
    expect(sanitizeParagraphHtml(paragraph, ['#separate-note'], [dom.window.document.body])).toContain(noteText);
  });

  it('reads a visible author instead of a hidden avatar or an unrelated external profile', () => {
    const dom = page('<a href="https://social.example/profile/publisher">Publisher account</a><a aria-hidden="true" href="/author/morgan-example">ME</a><a href="/author/morgan-example">Morgan Example</a><article><h1>Field observations</h1></article>');
    expect(extractMetadata(dom.window.document, dom.window.location.href).author).toBe('Morgan Example');
  });

  it('reads the current article author from structured data without using publisher or unrelated article authors', () => {
    const data = { '@graph': [
      { '@type': 'Article', url: 'https://example.test/different', author: { name: 'Other Example' } },
      { '@type': 'Article', url: 'https://example.test/report', author: { '@id': '#writer' }, publisher: { name: 'Publisher Example' } },
      { '@type': 'Person', '@id': '#writer', name: 'Morgan Example' }
    ] };
    const dom = page(`<script type="application/ld+json">${JSON.stringify(data)}</script><a href="https://social.example/profile/publisher"></a><article><h1>Field observations</h1></article>`);
    expect(extractMetadata(dom.window.document, dom.window.location.href).author).toBe('Morgan Example');
  });

  it.each(['#cover', '#cover img'])('extracts the selected hero resource from an image or its semantic container: %s', async heroImage => {
    const dom = page('<header><figure id="cover"><img src="/survey-cover.png" width="800" height="500"><figcaption>Survey stations.</figcaption></figure></header><article><h1>Field observations</h1><p>The first observation establishes the measurement baseline.</p></article>');
    dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article', heroImage });
    expect(result.content.filter(item => item.type === 'image')).toMatchObject([{ src: 'https://example.test/survey-cover.png', isFeatured: true }]);
    expect(result.content.filter(item => item.type === 'image')).toHaveLength(1);
  });

  it('respects an explicitly excluded hero subtree after resolving a container selector', async () => {
    const dom = page('<figure id="cover"><img src="/survey-cover.png" width="800" height="500"></figure><article><h1>Field observations</h1><p>The first observation establishes the measurement baseline.</p></article>');
    dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article', heroImage: '#cover', exclude: ['#cover'] });
    expect(result.content.filter(item => item.type === 'image')).toEqual([]);
  });

  it.each(['By the final observation, the sample count had doubled.', 'Edited by the field team, the revised procedure uses fewer measurements.'])('retains a prose sentence whose opening resembles metadata: %s', text => {
    const dom = page(`<article><p>${text}</p></article>`);
    expect(handleParagraph(dom.window, dom.window.document.querySelector('p'), { selectionExclusions: [] }, constants)?.text).toBe(text);
  });
});

describe('Rendered mathematics with canonical source notation', () => {
  it('preserves semantic powers and unsupported source TeX without duplicate renderer layers', async () => {
    const dom = page('<article><h1>Calibration relationships</h1><p>The first scale is <span class="MathJax" id="formula-main-Frame"><nobr aria-hidden="true">r3</nobr><span class="MJX_Assistive_MathML"><math><msup><mi>r</mi><mn>3</mn></msup></math></span></span><script type="math/tex" id="formula-main">r^3</script>, and the second is <span class="MathJax" id="formula-other-Frame"><nobr aria-hidden="true">p/q</nobr><span class="MJX_Assistive_MathML"><math><mfrac><mi>p</mi><mi>q</mi></mfrac></math></span></span><script type="math/tex" id="formula-other">\\frac{p}{q}</script>.</p></article>');
    const before = dom.window.document.body.innerHTML, result = await extract(dom);
    const paragraph = result.content.find(item => item.type === 'paragraph');
    expect(paragraph.text).toBe('The first scale is <span class="math">r<sup>3</sup></span>, and the second is  $\\frac{p}{q}$ .');
    expect(paragraph.text).not.toContain('MathJax');
    expect(dom.window.document.body.innerHTML).toBe(before);
  });
});
