import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../../scripts/background.js', import.meta.url), 'utf8');
const inlineSource = source.slice(source.indexOf('export function extractFromPageInlined')).replace(/^export /, '');
const documents = [];
afterEach(() => { for (const document of documents.splice(0)) document.window.close(); });

function extract(html, baseUrl, selectors = {}) {
  const dom = new JSDOM(html, { url: 'https://example.com/article', runScripts: 'outside-only' });
  documents.push(dom);
  dom.window.console.log = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 400 });
  const productionExtract = dom.window.eval(`(${inlineSource})`);
  return productionExtract({ articleContainer: 'main', content: 'p,img', title: 'h1', ...selectors }, baseUrl || dom.window.location.href);
}

describe('selector page extraction', () => {
  it('rejects navigation before reading the new document and permits an anchor change', () => {
    const html = '<h1>Article</h1><main><p>A paragraph with enough content to extract.</p></main>';
    expect(() => extract(html, 'https://example.com/other-article')).toThrow('page changed');
    expect(extract(html, 'https://example.com/article#section').title).toBe('Article');
  });
  it.each(['Token budgets in C#', 'Budgeting for a project', 'C# and F# language design'])('preserves ordinary title text: %s', title => {
    expect(extract(`<h1>${title}</h1><main><p>A paragraph with enough content to extract.</p></main>`).title).toBe(title);
  });

  it('keeps distinct images with matching paths on different hosts or different path case', () => {
    const urls = ['https://first.example/Photo.png', 'https://second.example/Photo.png', 'https://first.example/photo.png'];
    const result = extract(`<main>${urls.map(url => `<img src="${url}" width="200" height="200">`).join('')}</main>`);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(urls);
  });

  const before = 'Before the figure: calibration improves measurements.';
  const after = 'After the figure: compare the recorded observations.';
  const figure = '<figure><img src="https://images.example/first.png" width="500" height="400"><figcaption>Calibration plot caption.</figcaption></figure>';
  it.each([
    `${before}${figure}${after}`,
    `<span>${before}</span>${figure}<span>${after}</span>`,
    `<span>${before}${figure}${after}</span>`
  ])('preserves inline prose around a figure in DOM order: %s', snippet => {
    const result = extract(`<main><div class="story">${snippet}</div><img src="https://images.example/second.png" width="500" height="400"></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'image']);
    expect(result.content[0].text).toContain(before);
    expect(result.content[2].text).toContain(after);
    expect(result.content.filter(item => item.type === 'paragraph').map(item => item.text).join('')).not.toContain('Calibration plot caption.');
    expect(JSON.stringify(result.content).match(/Before the figure/g)).toHaveLength(1);
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://images.example/first.png', 'https://images.example/second.png']);
    expect(result.content[1].caption).toBe('Calibration plot caption.');
  });

  it('preserves inline formatting and excludes matching subtrees around the figure', () => {
    const result = extract(`<main><div class="story"><span style="font-weight:bold">${before}${figure}<span class="omit">Excluded prose.</span>${after}</span></div></main>`, undefined, { content: '.story,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(result.content[0].text).toContain(`<strong>${before}</strong>`);
    expect(result.content[2].text).toContain(`<strong>${after}</strong>`);
    expect(JSON.stringify(result.content)).not.toContain('Excluded prose.');
  });

  it('does not emit excluded figures or duplicate overlapping selected descendants', () => {
    const result = extract(`<main><div class="story"><font>${before}${figure}${after}</font><figure class="omit"><img src="https://images.example/omitted.png" width="500" height="400"><figcaption>Excluded caption.</figcaption></figure></div></main>`, undefined, { content: '.story,font,img', exclude: ['.omit'] });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(JSON.stringify(result.content).match(/Before the figure/g)).toHaveLength(1);
    expect(JSON.stringify(result.content)).not.toContain('omitted.png');
    expect(JSON.stringify(result.content)).not.toContain('Excluded caption.');
  });

  it('keeps structured paragraphs and lists on their existing extraction path', () => {
    const result = extract(`<main><div class="story"><p>${before}</p>${figure}<ul><li>A recorded observation.</li></ul><p>${after}</p></div></main>`, undefined, { content: '.story,img' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'list', 'paragraph']);
    expect(result.content[0].text).toBe(before);
    expect(result.content[3].text).toBe(after);
  });

  it.each([
    ['table', '<table><tbody><tr><td>Recorded value</td><td>12</td></tr></tbody></table>', 'Recorded value'],
    ['code', '<pre><code>const answer = 42;</code></pre>', 'const answer = 42;']
  ])('preserves %s content inside a non-image figure', (type, body, expected) => {
    const result = extract(`<main><div class="story">${before}<figure>${body}<figcaption>Recorded example.</figcaption></figure>${after}</div></main>`, undefined, { content: '.story,table,pre' });
    expect(result.content.some(item => item.type === type)).toBe(true);
    expect(JSON.stringify(result.content)).toContain(expected);
  });
});
