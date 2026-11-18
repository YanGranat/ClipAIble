import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';

const inlineSource = extractAutomaticallyInlined.toString();
const documents = [];
afterEach(() => { for (const document of documents.splice(0)) document.window.close(); });

async function extract(html, baseUrl, selectors = {}) {
  const dom = new JSDOM(html, { url: 'https://example.com/article', runScripts: 'outside-only' });
  documents.push(dom);
  dom.window.console.log = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 400 });
  const productionExtract = dom.window.eval(`(${inlineSource})`);
  return productionExtract(baseUrl || dom.window.location.href, true, { articleContainer: 'main', content: 'p,img', title: 'h1', ...selectors });
}

function contentMarkup(result) {
  return result.content.map(item => item.html || item.text || item.caption || '').join('\n');
}

describe('selector page extraction', () => {
  it.each(['articleContainer', 'content', 'title', 'subtitle', 'heroImage', 'toc', 'exclude'])('returns a typed miss for invalid CSS in %s', async field => {
    const selectors = { [field]: field === 'exclude' ? ['p >>'] : 'p >>' };
    const result = await extract('<main><h1>Current article</h1><p>Unselected text must not become a successful result.</p></main>', undefined, selectors);
    expect(result.selectorMatched).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.content).toEqual([]);
  });

  it.each([
    { articleContainer: '.missing-container', content: 'p' },
    { articleContainer: 'main', content: '.missing-body' }
  ])('returns a selector miss without reading unrelated body content: %j', async selectors => {
    const result = await extract('<main><p>Unselected page text must not become a successful selector result.</p></main>', undefined, selectors);
    expect(result.selectorMatched).toBe(false);
    expect(result.content).toEqual([]);
  });

  it('rejects another article query on the same path', async () => {
    await expect(extract('<main><p>The selected article has its own content.</p></main>', 'https://example.com/article?id=other')).rejects.toThrow('page changed');
  });

  it('honors image exclusions inside selected prose while protecting prose from an excluded outer wrapper', async () => {
    const html = '<div class="site-wrapper"><article><h1>Field observations</h1><div class="hero"><img src="/hero.png" width="700" height="400"></div><div class="story"><p>The field report contains a substantial introduction.</p><figure><img src="/body.png" width="600" height="400"><figcaption>The survey illustration.</figcaption></figure><figure data-role="related"><a href="/another-report"><img src="/related.png" width="600" height="400"></a></figure><div class="subscription-box"><picture><img src="/avatar.png" width="100" height="100"></picture><p><img src="/promotion.png" width="600" height="400"></p></div><p>The field report retains its conclusion.</p></div></article></div>';
    const result = await extract(html, undefined, { articleContainer: 'article', content: '.story', heroImage: '.hero img', exclude: ['.site-wrapper', 'figure[data-role="related"]', '.subscription-box'] });
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.com/hero.png', 'https://example.com/body.png']);
    expect(JSON.stringify(result.content)).toContain('The field report retains its conclusion.');
  });

  it.each(['(opens a new tab)', 'opens in a new window'])('omits marked link announcements while preserving authored and mathematical text: %s', async label => {
    const result = await extract(`<main><p>A report <a href="https://example.com/reference">reference<span class="screen-reader-text">${label}</span><span class="sr-only">Essential reference description.</span></a> remains available. The quoted phrase “opens a new tab” is part of this paragraph. <span class="sr-only">Essential author text.</span><math><mtext class="sr-only">opens a new tab</mtext></math></p></main>`);
    const text = result.content.map(item => item.text || '').join('');
    expect(text).not.toContain(label === '(opens a new tab)' ? '(opens a new tab)' : 'opens in a new window');
    expect(text).toContain('Essential reference description.');
    expect(text).toContain('Essential author text.');
    expect(text).toContain('The quoted phrase');
    expect(text.match(/opens a new tab/g)).toHaveLength(2);
  });

  it.each(['.twitter-tweet', 'blockquote.twitter-tweet'])('preserves readable embedded article quotations despite a widget exclusion: %s', async widgetSelector => {
    const result = await extract('<main><h1>Field observations</h1><div class="story"><p>The introduction provides context for the quotation.</p><blockquote class="twitter-tweet"><p>Repeated measurements improve the reliability of a field survey.</p>— Field observer <a href="https://example.com/notes/1">Reference</a></blockquote><p>The conclusion follows the quotation.</p></div></main>', undefined, { content: '.story', exclude: [widgetSelector] });
    const content = contentMarkup(result);
    expect(content.match(/Repeated measurements improve/g)).toHaveLength(1);
    expect(content.match(/Field observer/g)).toHaveLength(1);
    expect(content).toContain('The conclusion follows the quotation.');
  });

  it.each(['div class="omit"', 'div id="comments"', 'div class="advertisement"', 'nav'])('keeps embedded quotations excluded inside %s', async parent => {
    const tag = parent.split(' ')[0];
    const result = await extract(`<main><div class="story"><p>The article retains its own substantial introduction.</p><${parent}><blockquote class="twitter-tweet"><p>Excluded panel quotation must remain outside the document.</p></blockquote></${tag}><blockquote class="omit"><p>Explicitly excluded ordinary quotations must remain excluded.</p></blockquote><p>The article retains its conclusion.</p></div></main>`, undefined, { content: '.story', exclude: ['.twitter-tweet', '.omit', '#comments', '.advertisement', 'nav'] });
    expect(JSON.stringify(result.content)).not.toContain('Excluded panel quotation');
    expect(JSON.stringify(result.content)).not.toContain('Explicitly excluded ordinary');
    expect(JSON.stringify(result.content)).toContain('The article retains its conclusion.');
  });

  it('rejects navigation before reading the new document and permits an anchor change', async () => {
    const html = '<h1>Article</h1><main><p>A paragraph with enough content to extract.</p></main>';
    await expect(extract(html, 'https://example.com/other-article')).rejects.toThrow('page changed');
    expect((await extract(html, 'https://example.com/article#section')).title).toBe('Article');
  });
  it.each(['Token budgets in C#', 'Budgeting for a project', 'C# and F# language design'])('preserves ordinary title text: %s', async title => {
    expect((await extract(`<h1>${title}</h1><main><p>A paragraph with enough content to extract.</p></main>`)).title).toBe(title);
  });

  it('keeps distinct images with matching paths on different hosts or different path case', async () => {
    const urls = ['https://first.example/Photo.png', 'https://second.example/Photo.png', 'https://first.example/photo.png'];
    const result = await extract(`<main>${urls.map(url => `<img src="${url}" width="200" height="200">`).join('')}</main>`);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(urls);
  });

  const before = 'Before the figure: calibration improves measurements.';
  const after = 'After the figure: compare the recorded observations.';
  const figure = '<figure><img src="https://images.example/first.png" width="500" height="400"><figcaption>Calibration plot caption.</figcaption></figure>';
  it.each([
    `${before}${figure}${after}`,
    `<span>${before}</span>${figure}<span>${after}</span>`,
    `<span>${before}${figure}${after}</span>`
  ])('preserves inline prose around a figure in DOM order: %s', async snippet => {
    const result = await extract(`<main><div class="story">${snippet}</div><img src="https://images.example/second.png" width="500" height="400"></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'image']);
    expect(result.content[0].text).toContain(before);
    expect(result.content[2].text).toContain(after);
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text).join('')).not.toContain('Calibration plot caption.');
    expect(contentMarkup(result).match(/Before the figure/g)).toHaveLength(1);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://images.example/first.png', 'https://images.example/second.png']);
    expect(result.content[1].caption).toBe('Calibration plot caption.');
  });

  it('preserves inline formatting and excludes matching subtrees around the figure', async () => {
    const result = await extract(`<main><div class="story"><span style="font-weight:bold">${before}${figure}<span class="omit">Excluded prose.</span>${after}</span></div></main>`, undefined, { content: '.story,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(result.content[0].text).toContain(`<strong>${before}</strong>`);
    expect(result.content[2].text).toContain(`<strong>${after}</strong>`);
    expect(JSON.stringify(result.content)).not.toContain('Excluded prose.');
  });

  it('does not emit excluded figures or duplicate overlapping selected descendants', async () => {
    const result = await extract(`<main><div class="story"><font>${before}${figure}${after}</font><figure class="omit"><img src="https://images.example/omitted.png" width="500" height="400"><figcaption>Excluded caption.</figcaption></figure></div></main>`, undefined, { content: '.story,font,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(contentMarkup(result).match(/Before the figure/g)).toHaveLength(1);
    expect(JSON.stringify(result.content)).not.toContain('omitted.png');
    expect(JSON.stringify(result.content)).not.toContain('Excluded caption.');
  });

  it('keeps structured paragraphs and lists on their existing extraction path', async () => {
    const result = await extract(`<main><div class="story"><p>${before}</p>${figure}<ul><li>A recorded observation.</li></ul><p>${after}</p></div></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'list', 'paragraph']);
    expect(result.content[0].text).toBe(before);
    expect(result.content[3].text).toBe(after);
  });

  it.each([
    ['table', '<table><tbody><tr><td>Recorded value</td><td>12</td></tr></tbody></table>', 'Recorded value'],
    ['code', '<pre><code>const answer = 42;</code></pre>', 'const answer = 42;']
  ])('preserves %s content inside a non-image figure', async (type, body, expected) => {
    const result = await extract(`<main><div class="story">${before}<figure>${body}<figcaption>Recorded example.</figcaption></figure>${after}</div></main>`, undefined, { content: '.story,table,pre' });
    expect(result.content.some(item => item.type === type)).toBe(true);
    expect(JSON.stringify(result.content)).toContain(expected);
  });
});
