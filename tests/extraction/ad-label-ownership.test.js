import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { isExcluded } from '../../scripts/extraction/extractor/filters.js';
import { CONSTANTS, NAVIGATION_PATTERNS } from '../../scripts/extraction/extractor/constants.js';

const documents = [];
const constants = { ...CONSTANTS, NAV_PATTERNS_CONTAINS: NAVIGATION_PATTERNS.contains };
let serialized;
beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serialized = execFileSync(process.execPath, ['--input-type=module', '-e', `import {generateExtractAutomaticallyInlined} from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.unstubAllGlobals(); });

function page(content) {
  const dom = new JSDOM('<!doctype html><article><h1>Field observations</h1>' + content + '</article>', { url: 'https://example.test/observations', runScripts: 'outside-only' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  expect(dom.window.document.compatMode).toBe('CSS1Compat');
  return dom;
}
function advertisingFrame() {
  return '<iframe title="Advertisement" src="https://imasdk.googleapis.com/js/core/bridge.html"></iframe>';
}

describe('Advertising frame ownership', () => {
  it('excludes a dedicated advertising SDK frame without relying on the title alone', () => {
    const dom = page(advertisingFrame());
    expect(isExcluded(dom.window, dom.window.document.querySelector('iframe'), constants)).toBe(true);
    expect(isExcluded(dom.window, dom.window.document.querySelector('article'), constants)).toBe(false);
  });

  it.each([
    '<h2>Advertisement</h2><p>An advertisement can change attention without changing the measured result.</p>',
    '<section class="AdvertisementResearch"><h2>Advertisement</h2><p>The report distinguishes advertising from its effects.</p></section>',
    '<div><span class="label">Advertisement</span></div>'
  ])('retains authored headings/prose and labels outside an advertising frame: %s', html => {
    const dom = page(html);
    for (const element of dom.window.document.querySelectorAll('h2,p,span')) expect(isExcluded(dom.window, element, constants)).toBe(false);
  });

  it('preserves literal code even when it demonstrates classed ad-label markup', () => {
    const dom = page('<pre><code>&lt;iframe title="Advertisement" src="https://imasdk.googleapis.com/js/core/bridge.html"&gt;&lt;/iframe&gt;</code></pre><p>The example describes the markup without displaying an advertising control.</p>');
    for (const element of dom.window.document.querySelectorAll('pre,code,span,p')) expect(isExcluded(dom.window, element, constants)).toBe(false);
  });

  it.each([
    'https://example.test/advertisement-history',
    'https://imasdk.googleapis.com.example.test/frame',
    'https://example.test/frame?next=https://imasdk.googleapis.com/',
    'https://example.test/frame#imasdk.googleapis.com'
  ])('retains independent embedded content despite an advertising title or URL spelling: %s', src => {
    const dom = page(`<iframe title="Advertisement" src="${src}"></iframe>`);
    expect(isExcluded(dom.window, dom.window.document.querySelector('iframe'), constants)).toBe(false);
  });

  it.each([false, true])('runs the actual serialized extractor with automatic=%s and preserves body order without control labels', async automatic => {
    const first = 'The first observation establishes the baseline for this independent field report. The observers recorded the direction of each response before comparing their notes. A second reader checked the annotations against the original measurements. Each account retained its context and the conditions under which the result was obtained. The team separated the field notes from the presentation controls displayed alongside the account. This introductory discussion provides the reader with enough information to interpret the following comparison without relying on the surrounding interface.';
    const last = 'The final observation completes the account of the measured field response.';
    const dom = page(`<p>${first}</p>${advertisingFrame()}<h2>Advertisement</h2><p>An advertisement can change attention without changing the measured result.</p><pre><code>const label = "Advertisement";</code></pre><p>${last}</p>`);
    const before = dom.window.document.body.innerHTML;
    dom.window.console.log = () => {};
    dom.window.eval(serialized.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = automatic
      ? await dom.window.extract(dom.window.location.href, false)
      : await dom.window.extract(dom.window.location.href, false, { content: 'article', title: 'h1' });
    const paragraphs = result.content.filter(item => item.type === 'paragraph').map(item => (item.html ?? item.text).replace(/<[^>]*>/g, '').trim());
    expect(paragraphs).toEqual([first, 'An advertisement can change attention without changing the measured result.', last]);
    expect(result.content.filter(item => item.type === 'heading' && item.text === 'Advertisement')).toHaveLength(1);
    expect(JSON.stringify(result.content)).toContain('const label');
    expect(dom.window.document.body.innerHTML).toBe(before);
  });
});
