import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { extractStandfirst } from '../../scripts/extraction/extractor/standfirst.js';
import { sanitizeParagraphHtml, handleBlockquote, handleHeading, handleList, handleTable, handleCode } from '../../scripts/extraction/extractor/parse.js';
import { getImageCaption } from '../../scripts/extraction/extractor/images.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { extractWhenMainContentMissing, extractLastResortContainerSearch, extractUltimateFallbackAllParagraphs, extractEmergencyFallback, tryExtractTwitterX } from '../../scripts/extraction/extractor/fallbacks.js';

const documents = [];
const extractionConstants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS, NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH };
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const deck = 'Detailed measurements reveal how seasonal currents change the distribution of nutrients across the harbor.';
const signup = 'Receive a weekly collection of science stories by subscribing through this email form.';
function scene(markup) {
  const dom = new JSDOM(`<title>Harbor Sensor Report</title><article>${markup}</article>`, { url: 'https://example.test/report' });
  documents.push(dom); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('Node', dom.window.Node);
  return dom.window.document.querySelector('article');
}

it('skips a newsletter introduction and keeps a later matching article introduction', () => {
  const article = scene(`<section class="newsletter-signup"><p class="intro">${signup}</p></section><div class="intro">${deck}</div>`);
  const before = article.innerHTML;
  expect(extractStandfirst(article).text).toBe(deck);
  expect(article.innerHTML).toBe(before);
});

it('does not turn a newsletter introduction into a subtitle when no article deck exists', () => {
  const article = scene(`<section id="weekly-newsletter"><p class="intro">${signup}</p></section><p>${'The sensors measured a continuous series throughout the full observation period. '.repeat(5)}</p>`);
  expect(extractStandfirst(article)).toEqual({ text: null, element: null });
});

it('recognizes an excerpt near the article title ahead of a newsletter introduction', () => {
  const article = scene(`<h1>Harbor Sensor Report</h1><div class="article__excerpt">${deck}</div><section class="newsletter"><p class="newsletter__intro">${signup}</p></section>`);
  expect(extractStandfirst(article).text).toBe(deck);
});

it('preserves an ordinary deck that discusses newsletters without newsletter DOM ancestry', () => {
  const article = scene('<p class="deck">Newsletters can explain how observers collect measurements and share reproducible results with their readers.</p>');
  expect(extractStandfirst(article).text).toContain('Newsletters can explain');
});

it('does not prefer a recommendation-card excerpt over the article introduction', () => {
  const article = scene(`<h1>Harbor Sensor Report</h1><div class="intro">${deck}</div><aside class="related-stories"><div class="excerpt">A separate recommended report examines the history of coastal transport and its regional consequences.</div></aside>`);
  expect(extractStandfirst(article).text).toBe(deck);
});

const link = '<a href="/methods"><em>Measurement methods</em><span class="screen-reader-text"> (opens a new tab)</span></a>';
for (const [tag, wrap, parse] of [
  ['paragraph', value => `<p>Consult ${value} for the complete observation protocol.</p>`, element => sanitizeParagraphHtml(element)],
  ['quote', value => `<blockquote>Consult ${value} for the complete observation protocol.</blockquote>`, element => handleBlockquote(element).text],
  ['list', value => `<ul><li>Consult ${value} for the complete observation protocol.</li></ul>`, element => handleList(element).items.join(' ')],
  ['table', value => `<table><tr><td>Consult ${value} for the complete observation protocol and the full measurement results.</td></tr></table>`, element => handleTable(element).html],
  ['heading', value => `<h2>${value}</h2>`, element => handleHeading(element, { addedHeadings: new Set(), mainTitleText: '' }, CONSTANTS).text]
]) {
  it(`removes only an assistive link announcement from a ${tag}`, () => {
    const article = scene(wrap(link)), element = article.firstElementChild;
    const before = article.innerHTML, output = parse(element);
    expect(output).not.toContain('opens a new tab');
    expect(output).toContain('Measurement methods');
    expect(article.innerHTML).toBe(before);
    if (tag === 'paragraph' || tag === 'quote' || tag === 'table') expect(output).toContain('<a href="/methods"><em>Measurement methods</em></a>');
  });
}

it('removes an assistive announcement from an image caption without changing its link or source DOM', () => {
  const article = scene(`<figure><img src="/diagram.png"><figcaption>See ${link} for the data.</figcaption></figure>`), before = article.innerHTML;
  expect(getImageCaption(article.querySelector('img'))).toBe('See Measurement methods for the data.');
  expect(article.innerHTML).toBe(before);
});

it('preserves literal phrases, visible link labels, meaningful assistive text and math', () => {
  const article = scene('<p>The phrase “opens a new tab” describes browser behavior. <a href="/discussion"><span>(opens a new tab)</span></a> <span class="screen-reader-text">(opens a new tab)</span> <a href="/author"><span class="sr-only">Research editor</span></a> <a href="/notes"><span class="screen-reader-text">The phrase opens a new tab is discussed here.</span></a> <span class="sr-only"><math alttext="x + y"><mi>x</mi><mo>+</mo><mi>y</mi></math></span></p>');
  const output = sanitizeParagraphHtml(article.firstElementChild);
  expect(output).toContain('“opens a new tab”');
  expect(output).toContain('<span>(opens a new tab)</span>');
  expect(output).toContain('<span class="screen-reader-text">(opens a new tab)</span>');
  expect(output).toContain('Research editor');
  expect(output).toContain('The phrase opens a new tab is discussed here.');
  expect(output).toContain('$x + y$');
});

it('preserves the same phrase in code', () => {
  const article = scene('<pre><code>const label = "opens a new tab";</code></pre>');
  expect(handleCode(article.firstElementChild).text).toBe('const label = "opens a new tab";');
});

for (const [name, fallback] of [
  ['missing main', (win, document, state, root) => extractWhenMainContentMissing(win, document, state, extractionConstants, win.location.href)],
  ['container search', (win, document, state, root) => extractLastResortContainerSearch(win, document, state, extractionConstants, win.location.href)],
  ['all paragraphs', (win, document, state, root) => extractUltimateFallbackAllParagraphs(win, document, state, extractionConstants)],
  ['emergency', (win, document, state, root) => extractEmergencyFallback(win, document, state, extractionConstants, root)],
  ['social article', (win, document, state, root) => {
    root.setAttribute('data-testid', 'tweet');
    root.querySelectorAll('p').forEach((p, i) => { const block = document.createElement('div'); block.innerHTML = p.innerHTML; block.setAttribute('data-offset-key', String(i)); p.replaceWith(block); });
    const before = root.innerHTML;
    const result = tryExtractTwitterX(win, document, state, extractionConstants, 'https://x.com/i/article/0');
    expect(root.innerHTML).toBe(before);
    return result;
  }]
]) {
  it(`uses the same assistive-link rule in the ${name} fallback`, () => {
    const article = scene(`<p>Consult ${link} for the complete observation protocol.</p><p>The second reading provides an independent comparison of the measured values.</p><p>The final observation completes the experiment.</p>`), before = article.innerHTML;
    const result = fallback(article.ownerDocument.defaultView, article.ownerDocument, { addedHeadings: new Set(), processedImages: new Set(), mainTitleText: '' }, article);
    expect(result?.length).toBeGreaterThan(0);
    expect(result.map(item => item.text || item.html || '').join(' ')).not.toContain('opens a new tab');
    if (name !== 'social article') expect(article.innerHTML).toBe(before);
  });
}

it('applies canonical subtitle selectors and link cleanup in the serialized extractor', async () => {
  const dom = new JSDOM(`<title>Harbor Sensor Report</title><article><h1>Harbor Sensor Report</h1><div class="article__excerpt">${deck}</div><p>${'The sensor readings explain how seasonal currents change over time. '.repeat(12)} ${link}</p><section class="newsletter"><p class="newsletter__intro">${signup}</p></section></article>`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom); vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
  dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
  const result = await dom.window.extract('https://example.test/report');
  expect(result.content.find(item => item.type === 'subtitle')?.text).toBe(deck);
  expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text).join(' ')).not.toContain('opens a new tab');
});
