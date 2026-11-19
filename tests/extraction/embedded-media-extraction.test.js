import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { runExtraction } from '../../scripts/extraction/extractor/index.js';

const windows = [];
const sourceUrl = 'https://example.test/survey';
async function extract(markup, inspect = () => {}) {
  const dom = new JSDOM(`<title>Coastal Survey</title><article>${markup}</article>`, { url: sourceUrl });
  windows.push(dom.window);
  for (const name of ['window', 'document', 'Node', 'HTMLImageElement']) vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name]);
  const before = dom.window.document.querySelector('article').outerHTML;
  inspect(dom.window.document);
  const result = await runExtraction(sourceUrl, false, { content: 'article' });
  expect(result.error).toBeUndefined();
  expect(dom.window.document.querySelector('article').outerHTML).toBe(before);
  return result.content;
}
afterEach(() => { for (const win of windows.splice(0)) win.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const chart = '<iframe id="observation-chart" title="Measured response" src="https://datawrapper.dwcdn.net/aBc12/4/"></iframe>';

describe('Embedded media in selected article content', () => {
  it('keeps a static chart and its source between neighboring paragraphs', async () => {
    const content = await extract(`<p>The first observation introduces the chart.</p>${chart}<p>The final observation completes the report.</p>`);
    expect(content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'paragraph']);
    expect(content[1].src).toBe('https://datawrapper.dwcdn.net/aBc12/full.png');
    expect(content[2]).toMatchObject({ id: 'observation-chart', html: '<a href="https://datawrapper.dwcdn.net/aBc12/4/">Measured response</a>' });
    expect(content[0].text).toContain('first observation');
    expect(content[3].text).toContain('final observation');
  });

  it('does not consume a chart inside a figure containing another image', async () => {
    const content = await extract(`<figure><img src="/diagram.png" width="640" height="480">${chart}<figcaption>Recorded measurements.</figcaption></figure>`);
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/diagram.png', 'https://datawrapper.dwcdn.net/aBc12/full.png']);
    expect(content.filter(item => item.html?.includes('href="https://datawrapper.dwcdn.net/aBc12/4/"'))).toHaveLength(1);
    expect(content.filter(item => item.text === 'Recorded measurements.')).toHaveLength(1);
  });

  it('does not classify an opaque chart ID as an advertising role', async () => {
    const content = await extract('<iframe title="Measured response" src="https://datawrapper.dwcdn.net/aD123/4/"></iframe>');
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://datawrapper.dwcdn.net/aD123/full.png']);
    expect(content.filter(item => item.html?.includes('https://datawrapper.dwcdn.net/aD123/4/'))).toHaveLength(1);
  });

  it('does not classify an opaque video ID or query token as an advertising role', async () => {
    const content = await extract('<iframe title="Recorded observation" src="https://www.youtube.com/embed/aD123?token=doubleclick"></iframe>');
    expect(content).toMatchObject([{ type: 'paragraph', html: '<a href="https://www.youtube.com/embed/aD123?token=doubleclick">Recorded observation</a>' }]);
    expect(content).toHaveLength(1);
  });

  it.each([
    ['iframe', chart, ['paragraph', 'image', 'paragraph', 'paragraph']],
    ['video', '<video src="/recording.mp4" poster="/recording.png" title="Recorded observation"></video>', ['paragraph', 'image', 'paragraph', 'paragraph']],
    ['audio', '<audio src="/recording.ogg" title="Recorded observation"></audio>', ['paragraph', 'paragraph', 'paragraph']]
  ])('partitions inline %s without letting its paragraph consume it', async (tag, markup, types) => {
    const content = await extract(`<p>The first observation precedes the recording. ${markup} The final observation follows it.</p>`, document => {
      expect(document.querySelector(tag).parentElement.tagName).toBe('P');
    });
    expect(content.map(item => item.type)).toEqual(types);
    expect(content[0].text).toContain('first observation');
    expect(content.at(-1).text).toContain('final observation');
    expect(content.map(item => item.html || '').join('')).not.toMatch(/<(?:iframe|video|audio)\b/);
  });

  it('keeps an original paragraph representation and its media without duplicate translated prose', async () => {
    const content = await extract(`<p data-original-text="Original observation before and after the recording.">Translated observation before. ${chart} Translated observation after.</p>`);
    expect(content.filter(item => item.text === 'Original observation before and after the recording.')).toHaveLength(1);
    expect(content.filter(item => item.type === 'image')).toHaveLength(1);
    expect(content.map(item => item.html || '').join('')).not.toContain('Translated observation');
    expect(content.filter(item => item.html?.includes('https://datawrapper.dwcdn.net/aBc12/4/'))).toHaveLength(1);
  });

  it.each(['https://googleads.g.doubleclick.net/pagead/player', 'https://www.googleadservices.com/player', 'https://ads.pubmatic.com/player'])('continues excluding an advertising-network frame: %s', async src => {
    const content = await extract(`<p>The report retains this body paragraph.</p><iframe title="Advertising" src="${src}"></iframe>`);
    expect(content).toMatchObject([{ type: 'paragraph', text: 'The report retains this body paragraph.' }]);
    expect(content).toHaveLength(1);
  });

  it.each(['before', 'after'])('emits one poster when an existing image appears %s its video', async order => {
    const poster = '<img src="/recording.png" width="640" height="480">';
    const video = '<video poster="/recording.png" title="Field recording"><source src="/recording.mp4"><p>The recording documents the measured response.</p></video>';
    const content = await extract(`<figure>${order === 'before' ? poster + video : video + poster}<figcaption>Recorded measurements.</figcaption></figure>`);
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/recording.png']);
    expect(content.filter(item => item.html?.includes('href="https://example.test/recording.mp4"'))).toHaveLength(1);
    expect(content.filter(item => item.text === 'The recording documents the measured response.')).toHaveLength(1);
  });

  it('retains an audio source and authored fallback prose', async () => {
    const content = await extract('<audio title="Field recording" src="/recording.ogg"><p>The recording documents the measured response.</p></audio>');
    expect(content.map(item => item.type)).toEqual(['paragraph', 'paragraph']);
    expect(content[0].html).toContain('href="https://example.test/recording.ogg"');
    expect(content[1].text).toContain('measured response');
  });

  it('continues omitting hidden media, advertising frames, and navigation embeds', async () => {
    const content = await extract(`<p>The report retains this body paragraph.</p><iframe style="display:none" src="https://example.test/hidden-player"></iframe><iframe class="advertisement" src="https://ads.example.test/player"></iframe><nav><iframe src="https://example.test/navigation-player"></iframe></nav>`);
    expect(content).toMatchObject([{ type: 'paragraph', text: 'The report retains this body paragraph.' }]);
    expect(content).toHaveLength(1);
  });

  it('preserves a chart through the serialized extraction function', async () => {
    const dom = new JSDOM(`<title>Coastal Survey</title><article>${chart}</article>`, { url: sourceUrl, runScripts: 'outside-only' });
    windows.push(dom.window);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(sourceUrl, false, { content: 'article' });
    expect(result.error).toBeUndefined();
    expect(result.content).toMatchObject([{ type: 'image', src: 'https://datawrapper.dwcdn.net/aBc12/full.png' }, { type: 'paragraph', id: 'observation-chart', html: '<a href="https://datawrapper.dwcdn.net/aBc12/4/">Measured response</a>' }]);
  });
});
