import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { runExtraction } from '../../scripts/extraction/extractor/index.js';

const windows = [];
const normalize = text => text.replace(/\s+/g, ' ').trim();
function visibleContent(content) {
  return content.map(item => item.type === 'image' ? (item.caption || '') :
    item.type === 'table' ? [...(item.headers || []), ...(item.rows || []).flat()].join(' ') : item.html || item.text || '')
    .map(html => normalize(JSDOM.fragment(html).textContent || '')).filter(Boolean);
}
async function extract(body, exclude = []) {
  const dom = new JSDOM(`<title>Coastal Survey</title><article>${body}</article>`, { url: 'https://example.test/survey' });
  windows.push(dom.window);
  for (const name of ['window', 'document', 'Node', 'HTMLImageElement']) vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name]);
  const before = dom.window.document.querySelector('article').outerHTML;
  const result = await runExtraction(dom.window.location.href, false, { content: 'article', exclude });
  expect(result.error).toBeUndefined();
  expect(dom.window.document.querySelector('article').outerHTML).toBe(before);
  return result.content;
}
afterEach(() => { for (const win of windows.splice(0)) win.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const image = '<img src="/measurements.png" width="640" height="480">';

describe('Authored figure data', () => {
  it('keeps labels, short values, links, and the caption in source order', async () => {
    const content = await extract(`<p>The survey introduces the measurements.</p><figure>${image}<div class="metrics"><div>Cedar Basin</div><div>Mean depth:</div><div><span>8 m</span></div><div>Annual flow:</div><div><strong>13%</strong></div><div><a href="/measurements">Dataset</a></div></div><figcaption>Independent observations.</figcaption></figure><p>The final measurement completes the report.</p>`);
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/measurements.png']);
    const expected = ['The survey introduces the measurements.', 'Cedar Basin', 'Mean depth:', '8 m', 'Annual flow:', '13%', 'Dataset', 'Independent observations.', 'The final measurement completes the report.'];
    const text = visibleContent(content).join(' ');
    let offset = 0;
    for (const value of expected) {
      const position = text.indexOf(value, offset);
      expect(position, value).toBeGreaterThanOrEqual(offset);
      expect(text.split(value).length - 1, value).toBe(1);
      offset = position + value.length;
    }
    expect(content.map(item => item.html || '').join('')).toContain('href="https://example.test/measurements"');
  });

  it('keeps inline prose before and after figure media', async () => {
    const content = await extract(`<figure>First observation <span>before the chart.</span>${image}<span>Second observation after the chart.</span><figcaption>Measured response.</figcaption></figure>`);
    expect(content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'paragraph']);
    expect(visibleContent(content)).toEqual(['First observation before the chart.', 'Second observation after the chart.', 'Measured response.']);
  });

  it('keeps text-only figure data without requiring an image', async () => {
    const content = await extract('<figure><div>Station:</div><div>Q7</div><div>Depth:</div><div>8</div><figcaption>Recorded measurements.</figcaption></figure>');
    expect(visibleContent(content)).toEqual(['Station:', 'Q7', 'Depth:', '8', 'Recorded measurements.']);
  });

  it('continues emitting an image-only figure with one caption', async () => {
    const content = await extract(`<figure><div>${image}</div><figcaption><p>Measured response.</p></figcaption></figure>`);
    expect(content).toMatchObject([{ type: 'image', src: 'https://example.test/measurements.png', caption: 'Measured response.' }]);
    expect(content).toHaveLength(1);
  });

  it('keeps one original-text representation and its media for an atomic translated figure', async () => {
    const content = await extract(`<figure data-original-text="Original calibration result.">${image}<div>Translated label</div><div>18 m</div><figcaption>Translated caption.</figcaption></figure>`);
    expect(visibleContent(content)).toEqual(['Original calibration result.']);
    expect(content.filter(item => item.type === 'image')).toHaveLength(1);
    expect(content.map(item => item.html || '').join('')).not.toContain('<img');
  });

  it('restores original inline field text without discarding the rest of a field', async () => {
    const content = await extract('<figure><div data-original-text="Original station">Translated station</div><div><span data-original-text="Original depth">Translated depth</span> is 8 m.</div><figcaption>Recorded measurements.</figcaption></figure>');
    expect(visibleContent(content)).toEqual(['Original station', 'Original depth is 8 m.', 'Recorded measurements.']);
  });

  it('keeps explicit exclusions, hidden data, and controls out of figure text', async () => {
    const content = await extract(`<figure>${image}<div>Depth:</div><div>8 m</div><div class="omit">An unrelated promotion belongs outside the report.</div><div style="display:none"><div>A hidden draft measurement.</div></div><button><div>Share this chart</div></button><div role="button">Share this observation</div><select><option>Change view</option></select><figcaption>Measured response.</figcaption></figure>`, ['.omit']);
    const text = visibleContent(content).join(' ');
    expect(text).toContain('Depth:');
    expect(text).toContain('8 m');
    expect(text).not.toMatch(/unrelated promotion|hidden draft|Share this chart|Share this observation|Change view/);
  });

  it('preserves structured figure descendants without duplicating their text', async () => {
    const content = await extract(`<figure>${image}<table><tr><th>Station</th><th>Depth</th></tr><tr><td>Cedar</td><td>8 m</td></tr></table><pre><code>measured = 8</code></pre><figcaption>Recorded measurements.</figcaption></figure>`);
    expect(content.filter(item => item.type === 'table')).toHaveLength(1);
    expect(content.filter(item => item.type === 'code')).toMatchObject([{ text: 'measured = 8' }]);
    expect(visibleContent(content).join(' ').split('Cedar').length - 1).toBe(1);
  });

  it('does not broaden ordinary short layout text outside figures', async () => {
    const content = await extract('<div>Q7</div><p>The report retains its complete body paragraph.</p><aside><figure><div>Unrelated menu label</div><div>42</div></figure></aside>');
    expect(visibleContent(content)).toEqual(['The report retains its complete body paragraph.']);
  });

  it('retains figure fields in the serialized page extractor', async () => {
    const dom = new JSDOM(`<title>Coastal Survey</title><article><figure>${image}<div>Depth:</div><div>8 m</div><figcaption>Measured response.</figcaption></figure></article>`, { url: 'https://example.test/survey', runScripts: 'outside-only' });
    windows.push(dom.window);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article' });
    expect(result.error).toBeUndefined();
    expect(visibleContent(result.content)).toEqual(['Depth:', '8 m', 'Measured response.']);
    expect(result.content.filter(item => item.type === 'image')).toHaveLength(1);
  });
});
