import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

let serialized;
const documents = [];
const caption = 'Survey equipment beside the observation site. Field archive.';
const picture = '<img id="cover-image" src="/survey.png" width="720" height="450" alt="Survey equipment">';
const figure = `<figure id="cover"><div>${picture}</div><figcaption>${caption}</figcaption></figure>`;
const prose = '<p>The observation report describes the complete survey procedure and the independently recorded measurements.</p>';

beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serialized = execFileSync(process.execPath, ['--input-type=module', '-e', `import {generateExtractAutomaticallyInlined} from ${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
afterEach(() => { documents.splice(0).forEach(dom => dom.window.close()); vi.restoreAllMocks(); });

async function extract(header, { heroImage = '#cover', inside = false, exclude = [], body = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><title>Observation report</title><main><h1>Observation report</h1>${inside ? '' : header}<div id="reading">${prose}${inside ? header : ''}${body}<p>The final observation completes the report.</p></div></main>`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom);
  vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
  const before = dom.window.document.body.innerHTML;
  const run = dom.window.eval(`(${serialized.replace('export async function', 'async function')})`);
  const result = await run(dom.window.location.href, false, { content: '#reading', title: 'h1', heroImage, exclude });
  expect(result.error).toBeUndefined();
  expect(dom.window.document.body.innerHTML).toBe(before);
  return result.content;
}

async function extractMarkup(markup, selectors) {
  const dom = new JSDOM(`<!doctype html><title>Observation report</title>${markup}`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom);
  const before = dom.window.document.documentElement.outerHTML;
  const run = dom.window.eval(`(${serialized.replace('export async function', 'async function')})`);
  const result = await run(dom.window.location.href, false, selectors);
  expect(result.error).toBeUndefined();
  expect(dom.window.document.documentElement.outerHTML).toBe(before);
  return result.content;
}

describe('Selected hero caption ownership', () => {
  it.each(['#cover', '#cover-image'])('retains the caption owned by a selected outside-body resource: %s', async heroImage => {
    const content = await extract(figure, { heroImage });
    expect(content.filter(item => item.type === 'image')).toMatchObject([{ src: 'https://example.test/survey.png', caption, isFeatured: true }]);
    expect(content.filter(item => item.caption === caption || item.text === caption)).toHaveLength(1);
  });

  it('keeps a caption adjacent to an outside-body image', async () => {
    const content = await extract(`<div id="cover">${picture}<p class="caption">${caption}</p></div>`);
    expect(content.find(item => item.isFeatured)?.caption).toBe(caption);
  });

  it('does not move an in-body figure to the featured position', async () => {
    const content = await extract(figure, { inside: true });
    const image = content.findIndex(item => item.type === 'image');
    expect(image).toBeGreaterThan(content.findIndex(item => item.text?.includes('complete survey procedure')));
    expect(content[image]).toMatchObject({ caption });
    expect(content.some(item => item.isFeatured)).toBe(false);
  });

  it('preserves distinct header and body caption owners with the same resource and text', async () => {
    const content = await extract(figure, { body: figure.replaceAll('id="cover', 'id="body') });
    expect(content.filter(item => item.caption === caption || item.text === caption)).toHaveLength(2);
  });

  it.each(['hidden', 'style="display:none"', 'style="visibility:hidden"'])('does not borrow a hidden caption: %s', async attribute => {
    const content = await extract(figure.replace('<figcaption>', `<figcaption ${attribute}>`));
    expect(content.find(item => item.isFeatured)?.caption).toBe('');
  });

  it('keeps a visually rendered caption excluded only from the accessibility tree', async () => {
    const content = await extract(figure.replace('<figcaption>', '<figcaption aria-hidden="true">'));
    expect(content.find(item => item.isFeatured)?.caption).toBe(caption);
  });

  it('honors a caption exclusion independently of the selected image', async () => {
    expect((await extract(figure, { exclude: ['figcaption'] })).find(item => item.isFeatured)?.caption).toBe('');
  });

  it('does not assign a nested figure caption to its outer image', async () => {
    const nested = `<figure><img src="/detail.png" width="300" height="200"><figcaption>Detail view credit.</figcaption></figure>`;
    const content = await extract(figure.replace('<figcaption>', `${nested}<figcaption>`));
    expect(content.find(item => item.src === 'https://example.test/survey.png')?.caption).toBe(caption);
    expect(content.find(item => item.src === 'https://example.test/detail.png')?.caption).toBe('Detail view credit.');
  });

  it('preserves same-owner figures between multiple selected body roots', async () => {
    const content = await extractMarkup(`<article><div class="reading"><p>The first observation precedes the illustration.</p></div>${figure}<div class="reading"><p>The second observation follows the illustration.</p></div></article>`, { content: '.reading' });
    expect(content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(content[1]).toMatchObject({ src: 'https://example.test/survey.png', caption });
    expect(content.some(item => item.isFeatured)).toBe(false);
  });

  it('retains concrete media inside a selected reading component without an ARTICLE ancestor', async () => {
    const content = await extractMarkup(`<div id="reading" class="post"><h1>Observation report</h1><div class="header">${figure}</div>${prose}</div>`, { content: '#reading', title: 'h1' });
    expect(content.map(item => item.type)).toEqual(['image', 'paragraph']);
    expect(content[0]).toMatchObject({ src: 'https://example.test/survey.png', caption });
  });

  it('parses a source node once when body and media roots overlap', async () => {
    const content = await extractMarkup(`<article><div id="reading">${prose}${figure}</div></article>`, { content: ['article', '#reading'], heroImage: '#cover' });
    expect(content.filter(item => item.type === 'image')).toHaveLength(1);
    expect(content.filter(item => item.type === 'paragraph')).toHaveLength(1);
    expect(content.filter(item => item.caption === caption || item.text === caption)).toHaveLength(1);
  });

  it('does not expand the body through a page-wide hero selector', async () => {
    const content = await extractMarkup(`${figure}<article><div id="reading">${prose}</div></article><footer><figure><img src="/footer.png"><figcaption>Publisher footer credit.</figcaption></figure><p>Publisher footer text.</p></footer>`, { content: '#reading', heroImage: 'body' });
    expect(content.map(item => item.type)).toEqual(['paragraph']);
    expect(content[0].text).toContain('complete survey procedure');
  });

  it('keeps a rich subtitle without flattening links or repeating its source paragraph', async () => {
    const deck = 'An independent introduction explains the <a href="/method"><em>measurement method</em></a> and its conditions.';
    const content = await extractMarkup(`<article><h1>Observation report</h1><p id="deck" class="deck">${deck}</p>${prose}</article>`, { content: 'article', title: 'h1', subtitle: '#deck' });
    expect(content[0]).toMatchObject({ type: 'subtitle', id: 'deck', isStandfirst: true });
    expect(content[0].format).toBeUndefined();
    expect(content[0].html).toContain('<a href="https://example.test/method"><em>measurement method</em></a>');
    expect(content.filter(item => item.type === 'paragraph')).toHaveLength(1);
  });

  it('admits an explicitly selected inline subtitle at its source position', async () => {
    const content = await extractMarkup(`<article><h1>Observation report</h1><span id="deck">An authored <em>inline introduction</em> explains the complete measurement.</span>${prose}</article>`, { content: 'article', title: 'h1', subtitle: '#deck' });
    expect(content[0]).toMatchObject({ type: 'subtitle', id: 'deck', isStandfirst: true });
    expect(content[0].html).toContain('<em>inline introduction</em>');
    expect(content.filter(item => item.type === 'paragraph')).toHaveLength(1);
  });

  it.each(['<img>', '<figure hidden><img src="/unavailable.png"><figcaption>Excluded credit.</figcaption></figure>'])('does not mask excluded or unresolved source media with an OG cover', async media => {
    const content = await extractMarkup(`<meta property="og:image" content="/unrelated.png"><article>${media}${prose.repeat(8)}</article>`);
    expect(content.some(item => item.type === 'image')).toBe(false);
  });

  it('keeps metadata-only cover fallback specific to automatic extraction', async () => {
    const markup = `<meta property="og:image" content="/metadata.png"><article>${prose.repeat(8)}</article>`;
    const automatic = await extractMarkup(markup);
    expect(automatic.filter(item => item.type === 'image')).toMatchObject([{ src: 'https://example.test/metadata.png', caption: '', isFeatured: true }]);
    const selected = await extractMarkup(markup, { content: 'article' });
    expect(selected.some(item => item.type === 'image')).toBe(false);
  });
});
