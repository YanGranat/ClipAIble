import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateExtractAutomaticallyInlined } from '../../scripts/extraction/extractor/builder.js';
import { serializeReadingHtml } from '../../scripts/extraction/extractor/inline-content.js';

const documents = [];
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); });

const fixture = `
<style>
  .supplement { position: absolute; width: 1px; height: 1px; clip: rect(3px, 3px, 3px, 3px); overflow: hidden; }
  .sliver { position: absolute; width: 1px; height: 1px; clip: rect(0px, 1px, 1px, 0px); overflow-x: hidden; overflow-y: hidden; }
  .wide { width: 180px; height: 25px; }
</style>
<article>
  <h1>Document Index</h1>
  <p id="entry-3">The third entry documents the earlier measurement.</p>
  <p id="note">
    <!-- content parser boundary --><!-- editorial status marker -->
    The reading remains stable. <a id="return" href="#entry-3" role="doc-backlink"><span class="supplement">Go to the original marker:</span><span aria-hidden="true">3</span></a>
    <a href="/procedure"><span class="supplement">Instrument procedure</span></a>
    <a href="/scale"><span class="sliver">x</span><span aria-hidden="true">scale</span></a>
    <a href="/conditions"><span class="supplement wide">Compare the conditions</span><span>summary</span></a>
    <a href="#entry-3"><span class="supplement" id="named-marker">Named marker</span><span>4</span></a>
    <a href="/definition"><span class="supplement">The definition</span><span hidden>Hidden duplicate</span></a>
  </p>
  <p>The appendix compares the reading with an independent gauge. It records the pressure at the start of the observation, the units used for the comparison, and the time of the follow-up reading.</p>
  <p id="syntax">When the parser encounters <code>&lt;!-- example --&gt;</code>, it handles that token as markup.</p>
  <p id="source-markers">See <a id="source-marker" href="#counter-note">the counter note</a> and <a id="second-marker" href="#counter-note">its repetition</a>.</p>
  <ol>
    <li id="counter-note">
      <a href="#source-marker" data-counter><span class="supplement">Return to the reading:</span><span id="fallback-number" hidden>5</span></a>
      <a href="#second-marker" data-counter><span hidden>6</span></a>
      <a href="#entry-3" data-counter><span class="supplement">Read the other entry</span><span hidden>7</span></a>
      <span>The counter note explains the repeated observation.</span>
    </li>
  </ol>
</article>`;

function createDocument() {
  const dom = new JSDOM('<!doctype html>' + fixture, { url: 'https://example.test/index', runScripts: 'outside-only' });
  documents.push(dom);
  const { window } = dom;
  const readStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element, pseudo) => pseudo === '::before' && element.hasAttribute('data-counter')
    ? { content: 'counter(markers, lower-alpha)', display: 'inline', visibility: 'visible' }
    : readStyle(element);
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const style = window.getComputedStyle(this);
    return { width: Number.parseFloat(style.width) || 600, height: Number.parseFloat(style.height) || 400 };
  };
  return window;
}

function verifyReading(note) {
  expect(note.textContent).not.toContain('Go to the original marker');
  expect(note.innerHTML).not.toMatch(/content parser boundary|editorial status marker/);
  expect(note.querySelector('#return').getAttribute('href')).toBe('#entry-3');
  expect(note.querySelector('#return').textContent).toBe('3');
  expect(note.querySelector('a[href$="/scale"]').textContent).toContain('x');
  expect(note.querySelector('a[href$="/scale"]').textContent).toContain('scale');
  expect(note.querySelector('a[href$="/procedure"]').textContent).toContain('Instrument procedure');
  expect(note.querySelector('a[href$="/conditions"]').textContent).toContain('Compare the conditions');
  expect(note.querySelector('#named-marker')?.textContent).toContain('Named marker');
  expect(note.querySelector('a[href$="/definition"]').textContent).toContain('The definition');
}

function verifyCounterNote(note) {
  expect(note.textContent).not.toContain('Return to the reading');
  expect(note.querySelector('a[href="#source-marker"]')?.textContent).toBe('5');
  expect(note.querySelector('a[href="#second-marker"]')?.textContent).toBe('6');
  expect(note.querySelector('#fallback-number')?.hasAttribute('hidden')).toBe(false);
  expect(note.querySelector('a[href="#entry-3"]')?.textContent).toContain('Read the other entry');
  expect(note.querySelector('a[href="#entry-3"]')?.textContent).not.toContain('7');
  expect(note.textContent).toContain('The counter note explains the repeated observation.');
}

it('cleans clipped link supplements without removing other link text or fragment identity', () => {
  const { document } = createDocument();
  const source = document.querySelector('#note');
  const originalHtml = source.innerHTML;
  const result = document.createElement('p');
  result.innerHTML = serializeReadingHtml(source);
  verifyReading(result);
  expect(source.innerHTML).toBe(originalHtml);
  result.innerHTML = serializeReadingHtml(document.querySelector('#syntax'));
  expect(result.querySelector('code')?.textContent).toBe('<!-- example -->');
  result.innerHTML = serializeReadingHtml(document.querySelector('#counter-note'));
  verifyCounterNote(result);
});

it.each([undefined, { content: 'article', title: 'h1' }])('preserves reference links through the serialized extractor', async selectors => {
  const window = createDocument();
  const { document } = window;
  expect(document.compatMode).toBe('CSS1Compat');
  vi.spyOn(window.console, 'log').mockImplementation(() => {});
  const source = await generateExtractAutomaticallyInlined();
  const extract = window.eval('(' + source.replace('export async function', 'async function') + ')');
  const result = await extract(window.location.href, false, selectors);
  expect(result.error).toBeUndefined();
  expect(result.content.find(item => item.id === 'entry-3')?.text).toContain('third entry');
  const exported = document.createElement('p');
  exported.innerHTML = result.content.find(item => item.id === 'note').html;
  verifyReading(exported);
  exported.innerHTML = result.content.find(item => item.id === 'syntax').html;
  expect(exported.querySelector('code')?.textContent).toBe('<!-- example -->');
  exported.innerHTML = result.content.find(item => item.type === 'list').items.find(item => item.id === 'counter-note').html;
  verifyCounterNote(exported);
});
