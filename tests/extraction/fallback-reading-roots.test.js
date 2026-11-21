import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { runExtraction } from '../../scripts/extraction/extractor/index.js';
import { findFallbackReadingRoots, findSocialReadingRoot } from '../../scripts/extraction/extractor/fallbacks.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';

vi.mock('../../scripts/extraction/extractor/spa.js', () => ({ waitForContentLoad: async () => {} }));
vi.mock('../../scripts/extraction/extractor/discover.js', async original => ({
  ...await original(), findMainContent: () => null
}));

const pages = [];
afterEach(() => { pages.splice(0).forEach(page => page.window.close()); vi.unstubAllGlobals(); });
function page(body, url = 'https://example.test/report') {
  const dom = new JSDOM(`<title>Independent observations</title>${body}`, { url });
  pages.push(dom);
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  return dom.window;
}
async function extract(win) {
  const before = win.document.documentElement.outerHTML;
  const result = await runExtraction(win.location.href);
  expect(result.error).toBeUndefined();
  expect(win.document.documentElement.outerHTML).toBe(before);
  return result.content;
}
const paragraphs = content => content.filter(item => item.type === 'paragraph').map(item => item.text);

it('preserves separate equal Draft blocks and short authored readings', async () => {
  const win = page('<div data-testid="twitterArticleReadView"><div data-offset-key="a">An independent observation.</div><div data-offset-key="b">An independent observation.</div><div data-offset-key="c">Premium materials improve the measurement.</div><div data-offset-key="d">2024</div></div>', 'https://x.com/i/article/0');
  expect(paragraphs(await extract(win))).toEqual(['An independent observation.', 'An independent observation.', 'Premium materials improve the measurement.', '2024']);
});

it('preserves inline prose around media and distinct occurrences of the same resource', async () => {
  const win = page('<div data-testid="twitterArticleReadView"><div data-offset-key="a">Before the illustration.<img src="/sample.png" width="640" height="480" alt="Sample">After the illustration.</div><div data-offset-key="b"><img src="/sample.png" width="640" height="480" alt="Sample repeated"></div></div>', 'https://twitter.com/i/article/0');
  const content = await extract(win);
  expect(content.map(item => item.type === 'image' ? item.alt : item.text)).toEqual(['Before the illustration.', 'Sample', 'After the illustration.', 'Sample repeated']);
  expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://twitter.com/sample.png', 'https://twitter.com/sample.png']);
});

it('parses all fallback narrative blocks and advanced roles without count limits', async () => {
  const observations = Array.from({ length: 525 }, (_, index) => `<p>Observation ${index + 1} records the complete measurement.</p>`).join('');
  const win = page(`<article>${observations}<p>No.</p><ul><li>An independent list observation.</li></ul><table><tr><th>Sample</th><th>Value</th></tr><tr><td>A</td><td>12</td></tr></table><blockquote>A quoted observation.</blockquote><pre><code>measure(sample);</code></pre><figure><img src="/figure.png" width="640" height="480" alt="Measured figure"><figcaption>An authored figure credit.</figcaption></figure></article>`);
  const content = await extract(win);
  expect(paragraphs(content)).toHaveLength(526);
  expect(paragraphs(content).at(-1)).toBe('No.');
  expect(content.map(item => item.type).slice(-5)).toEqual(['list', 'table', 'quote', 'code', 'image']);
  expect(content.at(-1).caption).toBe('An authored figure credit.');
});

it('uses the same parser for scored containers and the final document scope', async () => {
  for (const wrap of [body => `<section>${body}</section>`, body => body]) {
    const win = page(wrap('<h2>Measurements</h2><p>First complete observation.</p><p>Second complete observation.</p><p>Third complete observation.</p><ul><li>Last observation.</li></ul>'));
    expect((await extract(win)).map(item => item.type)).toEqual(['heading', 'paragraph', 'paragraph', 'paragraph', 'list']);
  }
});

it('admits a social root itself when it directly owns inline text', async () => {
  const win = page('<article data-testid="tweet"><div data-testid="tweetText">A complete inline observation.</div></article>', 'https://mobile.twitter.com/status/0');
  expect(paragraphs(await extract(win))).toEqual(['A complete inline observation.']);
});

it('uses hostname identity for social discovery and ignores URL lookalikes', () => {
  const win = page('<article data-testid="tweet"><div data-testid="tweetText">An observation.</div></article>');
  for (const url of ['https://example.test/?source=x.com/post', 'https://x.com.example.test/post', 'https://notx.com/post', 'invalid']) {
    expect(findSocialReadingRoot(url, win.document)).toBeNull();
  }
  expect(findSocialReadingRoot('https://www.x.com/post', win.document)).toBe(win.document.querySelector('[data-testid="tweetText"]'));
});

it('keeps explicit selection misses authoritative and excludes publisher UI', async () => {
  const win = page('<nav><p>Publisher navigation text.</p></nav><article><p>A complete authored observation.</p><form><p>Subscription controls.</p><input type="email"><button>Subscribe</button></form></article>');
  const before = win.document.documentElement.outerHTML;
  const result = await runExtraction(win.location.href, false, { content: '#missing' });
  expect(result.selectorMatched).toBe(false);
  expect(result.content).toEqual([]);
  expect(paragraphs(await extract(win))).toEqual(['A complete authored observation.']);
  expect(win.document.documentElement.outerHTML).toBe(before);
  expect(findFallbackReadingRoots(win, win.document, CONSTANTS)[0]).toBe(win.document.querySelector('article'));
});
