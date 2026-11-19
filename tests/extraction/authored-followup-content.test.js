import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { isExcluded, isNavigationParagraph } from '../../scripts/extraction/extractor/filters.js';
import { handleParagraph } from '../../scripts/extraction/extractor/parse.js';
import { CONSTANTS, NAVIGATION_PATTERNS } from '../../scripts/extraction/extractor/constants.js';

const documents = [];
const constants = {
  ...CONSTANTS,
  NAV_PATTERNS_CONTAINS: NAVIGATION_PATTERNS.contains,
  NAV_PATTERNS_STARTS_WITH: NAVIGATION_PATTERNS.startsWith
};
let serializedExtractor;

beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serializedExtractor = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`
  ], { encoding: 'utf8' });
});

function page(body) {
  const dom = new JSDOM(`<!doctype html><title>Sensor field report</title><article><h1>Sensor field report</h1>${body}</article>`, {
    url: 'https://example.test/report', runScripts: 'outside-only'
  });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  return dom;
}

afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Authored follow-up references', () => {
  it.each([
    'Read more about calibration in the <a href="/guide">instrument guide</a>.',
    'The technicians can read more about calibration in the <a href="/guide">instrument guide</a>.',
    'Read more in <a href="/guide">the instrument guide</a>, then compare <a href="/measurements">the measurements</a>.'
  ])('retains a complete authored sentence and its inline references: %s', html => {
    const dom = page(`<p>${html}</p>`);
    const paragraph = dom.window.document.querySelector('p');
    expect(isExcluded(dom.window, paragraph, constants)).toBe(false);
    expect(isNavigationParagraph(paragraph.textContent, NAVIGATION_PATTERNS.startsWith, CONSTANTS.PAYWALL_PATTERNS)).toBe(false);
    const extracted = handleParagraph(dom.window, paragraph, { selectionExclusions: [] }, constants);
    expect(extracted).not.toBeNull();
    const restored = dom.window.document.createElement('div'); restored.innerHTML = extracted.text;
    expect(restored.textContent).toBe(paragraph.textContent);
    expect([...restored.querySelectorAll('a')].map(anchor => anchor.href)).toEqual(
      [...paragraph.querySelectorAll('a')].map(anchor => anchor.href)
    );
  });

  it.each(['Read more', 'READ MORE…', 'Read more »'])('excludes the standalone navigation label %s', text => {
    const dom = page(`<p>${text}</p>`);
    const paragraph = dom.window.document.querySelector('p');
    expect(isExcluded(dom.window, paragraph, constants)).toBe(true);
    expect(handleParagraph(dom.window, paragraph, { selectionExclusions: [] }, constants)).toBeNull();
  });

  it('keeps navigation and related-story ownership separate from authored body references', async () => {
    const html = '<p>Read more about calibration in the <a href="/guide">instrument guide</a>.</p>';
    const dom = page(`<p>The first observation establishes the measurement baseline.</p>${html}<nav><p>Read more about the <a href="/archive">archive</a> and its other reports.</p></nav><aside class="related"><p>Read more about the <a href="/different">next report</a> in this collection.</p></aside><p>The final observation completes the measurement record.</p>`);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article' });
    const paragraphs = result.content.filter(item => item.type === 'paragraph').map(item => {
      const node = dom.window.document.createElement('div'); node.innerHTML = item.text; return node;
    });
    expect(paragraphs.map(item => item.textContent)).toEqual([
      'The first observation establishes the measurement baseline.',
      'Read more about calibration in the instrument guide.',
      'The final observation completes the measurement record.'
    ]);
    expect(paragraphs.flatMap(item => [...item.querySelectorAll('a')].map(anchor => anchor.href))).toEqual(['https://example.test/guide']);
  });

  it('retains article content inside an application root whose identifier contains a directional word', async () => {
    const dom = page('<p>The first observation establishes the measurement baseline.</p><h2>Field measurements</h2><p>The second observation records the changing conditions.</p><div class="next"><p>A different report has its own separate introduction.</p></div><p>The final observation completes the measurement record.</p>');
    const host = dom.window.document.createElement('div'); host.id = '__next';
    const article = dom.window.document.querySelector('article'); article.replaceWith(host); host.appendChild(article);
    expect(isExcluded(dom.window, article.querySelector('p'), constants)).toBe(false);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    dom.window.eval(serializedExtractor.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article' });
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text)).toEqual([
      'The first observation establishes the measurement baseline.',
      'The second observation records the changing conditions.',
      'The final observation completes the measurement record.'
    ]);
    expect(result.content.filter(item => item.type === 'heading').map(item => item.text)).toEqual(['Field measurements']);
  });
});
