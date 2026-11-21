import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { normalizeHeadingForDedup } from '../../scripts/extraction/extractor/text-utils.js';
import { collectCandidateElements, parseElements } from '../../scripts/extraction/extractor/parse.js';
import { runExtraction } from '../../scripts/extraction/extractor/index.js';

vi.mock('../../scripts/extraction/extractor/spa.js', () => ({ waitForContentLoad: async () => {} }));

const title = 'A measured response';
const prose = '<p>The first observation records a complete independent measurement.</p>';
const markup = `<h1 id="cover">${title}</h1>${prose}<h2 id="method">${title}</h2>${prose}<h1 id="return">${title}</h1><h2 id="repeat">${title}</h2>${prose}`;
const constants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS, NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH };
const windows = [];
function page(body, url = 'https://example.org/article') {
  const dom = new JSDOM(`<title>${title}</title><article>${body}</article>`, { url, runScripts: 'outside-only' });
  windows.push(dom.window);
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  return dom.window;
}
function state() {
  return { processedImages: new Set(), addedHeadings: new Set(), mainTitleText: normalizeHeadingForDedup(title), standfirstElement: null, standfirstText: null, selectionExclusions: [], debugInfo: null };
}
function headings(content) {
  return content.filter(item => item.type === 'heading').map(({ id, text, level, format }) => ({ id, text, level, format }));
}
async function generatedRunner(win) {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  const generated = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
  return win.eval(`${generated.replace(/^export /m, '')}\nextractAutomaticallyInlined;`);
}
const expected = [
  { id: 'method', text: title, level: 2, format: 'text' },
  { id: 'return', text: title, level: 1, format: 'text' },
  { id: 'repeat', text: title, level: 2, format: 'text' }
];
afterEach(() => {
  windows.splice(0).forEach(win => win.close());
  vi.unstubAllGlobals();
});

describe('Heading source positions', () => {
  it('preserves repeated body headings and fragment targets in the serialized extractor', async () => {
    const win = page(markup);
    const run = await generatedRunner(win);
    const result = await run(win.location.href, false, { articleContainer: 'article', content: 'article', title: 'title' });
    expect(result.error).toBeUndefined();
    expect(headings(result.content)).toEqual(expected);
  });

  it('omits the initial article H1 after a featured hero and subtitle', async () => {
    const win = page(`<img id="hero" src="/hero.png" width="640" height="480" alt="An illustrated observation"><p id="deck">An independent summary introduces the measured observations.</p><section id="story"><h1 id="cover">${title}</h1>${prose}<h2 id="method">${title}</h2></section>`);
    const run = await generatedRunner(win);
    const result = await run(win.location.href, false, { articleContainer: 'article', content: '#story', title: 'title', heroImage: '#hero', subtitle: '#deck' });
    expect(result.error).toBeUndefined();
    expect(result.content.slice(0, 2).map(item => item.type)).toEqual(['image', 'subtitle']);
    expect(result.content[0].isFeatured).toBe(true);
    expect(headings(result.content)).toEqual([expected[0]]);
  });

  it('keeps an initial H2 equal to the article title', () => {
    const win = page(`<h2 id="method">${title}</h2>${prose}`);
    const root = win.document.querySelector('article');
    expect(headings(parseElements(win, collectCandidateElements(root, win), state(), constants, win.location.href))).toEqual([expected[0]]);
  });

  it('preserves distinct body heading occurrences in automatic extraction', async () => {
    const win = page(markup);
    const result = await runExtraction(win.location.href);
    expect(result.error).toBeUndefined();
    expect(headings(result.content)).toEqual(expected);
  });

  it('deduplicates the same Draft heading node without collapsing another source heading', async () => {
    const win = page(`<div data-testid="twitterArticleReadView"><div data-offset-key="a"><h1 class="longform-header-one" id="cover">${title}</h1></div><div data-offset-key="b">An independent body paragraph precedes the return.</div><div data-offset-key="c"><h2 class="longform-header-two" id="method">${title}</h2></div><div data-offset-key="d"><h2 class="longform-header-two" id="repeat">${title}</h2></div></div>`, 'https://x.com/i/article/123');
    expect(headings((await runExtraction(win.location.href)).content)).toEqual([expected[0], expected[2]]);
  });

  it.each([
    ['paragraph', prose],
    ['quote', '<blockquote>A quoted observation remains part of the body.</blockquote>'],
    ['code', '<pre>measure(sample);</pre>'],
    ['list', '<ul><li>A measured result</li></ul>'],
    ['table', '<table><tr><td>Sample</td><td>Value</td></tr><tr><td>One</td><td>12</td></tr></table>'],
    ['body image', '<img src="/observation.png" width="640" height="480" alt="Measured response">']
  ])('keeps a matching H1 after an emitted %s', (_name, before) => {
    const win = page(`${before}<h1 id="body-title">${title}</h1>`);
    const root = win.document.querySelector('article');
    const content = parseElements(win, collectCandidateElements(root, win), state(), constants, win.location.href);
    expect(content.some(item => item.type !== 'heading')).toBe(true);
    expect(headings(content)).toEqual([{ id: 'body-title', text: title, level: 1, format: 'text' }]);
  });

  it('uses DOM order before deciding whether an automatic body H1 is initial', async () => {
    const win = page(`${prose}<h1 id="body-title">${title}</h1>${prose}`);
    expect(headings((await runExtraction(win.location.href)).content)).toEqual([{ id: 'body-title', text: title, level: 1, format: 'text' }]);
  });
});
