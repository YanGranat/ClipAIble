import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

let serialized;
const documents = [];
const introduction = 'Independent field observations describe the changing survey area, the measurement method, and the conditions recorded during the visit.';
const body = Array.from({ length: 7 }, (_, index) => `<p>Observation ${index + 1}. ${introduction}</p>`).join('');
const artwork = '<img src="/base.jpg" width="640" height="400"><img src="/overlay.png" width="640" height="400">';
const figure = (credit, images = artwork) => `<figure>${images}<figcaption>${credit}</figcaption></figure>`;

beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  serialized = execFileSync(process.execPath, ['--input-type=module', '-e', `import {generateExtractAutomaticallyInlined} from ${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
afterEach(() => { documents.splice(0).forEach(doc => doc.window.close()); vi.restoreAllMocks(); });

async function extract({ header = figure('Original artwork credit.'), inside = '', metadata = '<meta property="og:image" content="/metadata-cover.jpg">', outside = '', after = '', selectors } = {}) {
  const dom = new JSDOM(`<!doctype html><title>Independent field observations</title>${metadata}${outside}<article><div class="article-header"><h1>Independent field observations</h1>${header}</div><div class="entry-content">${body}${inside}</div>${after}</article>`, { url: 'https://example.test/observations', runScripts: 'outside-only' });
  documents.push(dom); vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
  const original = dom.window.document.body.innerHTML;
  dom.window.eval(serialized.replace('export async function', 'async function') + '\nwindow.extract=extractAutomaticallyInlined;');
  const result = await dom.window.extract(dom.window.location.href, false, selectors);
  expect(result.error).toBeUndefined();
  expect(dom.window.document.body.innerHTML).toBe(original);
  expect(result.content.filter(item => item.type === 'paragraph' && item.text.includes('Observation '))).toHaveLength(7);
  return result.content;
}
const count = (content, credit) => content.filter(item => item.caption === credit || item.type === 'paragraph' && item.text === credit).length;

describe('Automatic article figure media ownership', () => {
  it('keeps physical header media and its exact caption without substituting an unrelated metadata cover', async () => {
    const content = await extract();
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/base.jpg', 'https://example.test/overlay.png']);
    expect(count(content, 'Original artwork credit.')).toBe(1);
    expect(content.findIndex(item => item.caption === 'Original artwork credit.')).toBeLessThan(content.findIndex(item => item.text?.startsWith('Observation 1.')));
    expect(content.some(item => item.src === 'https://example.test/metadata-cover.jpg')).toBe(false);
  });

  it('preserves separate header figure owners and gallery caption order', async () => {
    const content = await extract({ header: figure('First artwork credit.') + figure('Second artwork credit.') });
    const images = content.filter(item => item.type === 'image');
    expect(images).toHaveLength(4);
    expect(images.map(item => item.caption)).toEqual(['', 'First artwork credit.', '', 'Second artwork credit.']);
    expect(count(content, 'First artwork credit.')).toBe(1);
    expect(count(content, 'Second artwork credit.')).toBe(1);
  });

  it('keeps the same exact source owners when metadata is absent', async () => {
    const content = await extract({ metadata: '' });
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/base.jpg', 'https://example.test/overlay.png']);
    expect(count(content, 'Original artwork credit.')).toBe(1);
  });

  it('keeps body galleries and their credits in their source position', async () => {
    const content = await extract({ header: '', inside: figure('Body gallery credit.') + '<p>The final observation follows the gallery.</p>' });
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/base.jpg', 'https://example.test/overlay.png']);
    expect(content.some(item => item.isFeatured)).toBe(false);
    expect(count(content, 'Body gallery credit.')).toBe(1);
    expect(content.findIndex(item => item.caption === 'Body gallery credit.')).toBeGreaterThan(content.findIndex(item => item.text?.startsWith('Observation 7.')));
  });

  it('excludes proven publisher panels and media belonging to another article', async () => {
    const content = await extract({ header: `<aside class="related-stories">${figure('Aside panel credit.')}</aside><nav>${figure('Navigation credit.')}</nav><div class="related">${figure('Related credit.')}</div><div hidden>${figure('Hidden credit.')}</div><div style="display:none">${figure('CSS-hidden credit.')}</div><article class="related-stories">${figure('Related article credit.')}</article>`, outside: `<article>${figure('Other article credit.')}</article>` });
    for (const value of ['Aside panel credit.', 'Navigation credit.', 'Related credit.', 'Hidden credit.', 'CSS-hidden credit.', 'Related article credit.', 'Other article credit.']) expect(count(content, value)).toBe(0);
  });

  it('preserves identical credits and resource URLs belonging to separate figures', async () => {
    const content = await extract({ header: figure('Shared artwork credit.') + figure('Shared artwork credit.') });
    expect(content.filter(item => item.type === 'image')).toHaveLength(4);
    expect(count(content, 'Shared artwork credit.')).toBe(2);
  });

  it('keeps URL query identity for distinct physical header images', async () => {
    const content = await extract({ metadata: '', header: figure('Shared image credit.', '<img src="/base.jpg?variant=first" width="640" height="400">') + figure('Shared image credit.', '<img src="/base.jpg?variant=second" width="640" height="400">') });
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/base.jpg?variant=first', 'https://example.test/base.jpg?variant=second']);
    expect(count(content, 'Shared image credit.')).toBe(2);
  });

  it('retains short authored credits without prose-length heuristics', async () => {
    expect(count(await extract({ header: figure('A.B.') }), 'A.B.')).toBe(1);
  });

  it('keeps a separate body figure when its resource also occurs in the header', async () => {
    const content = await extract({ inside: figure('Body owner credit.', '<img src="/base.jpg" width="640" height="400">') });
    expect(count(content, 'Original artwork credit.')).toBe(1);
    expect(count(content, 'Body owner credit.')).toBe(1);
    expect(content.filter(item => item.src === 'https://example.test/base.jpg')).toHaveLength(2);
    expect(content.findIndex(item => item.caption === 'Body owner credit.')).toBeGreaterThan(content.findIndex(item => item.text?.startsWith('Observation 7.')));
  });

  it('keeps an admitted trailing figure after the body instead of prepending its credit', async () => {
    const content = await extract({ header: '', after: `<div class="article-header">${figure('Trailing credit.')}</div>` });
    expect(count(content, 'Trailing credit.')).toBe(1);
    expect(content.findIndex(item => item.caption === 'Trailing credit.')).toBeGreaterThan(content.findIndex(item => item.text?.startsWith('Observation 7.')));
  });

  it('uses the same physical source gallery in Selector mode', async () => {
    const content = await extract({ selectors: { content: '.entry-content', title: 'h1', heroImage: '.article-header figure' } });
    expect(content.filter(item => item.type === 'image').map(item => item.src)).toEqual(['https://example.test/base.jpg', 'https://example.test/overlay.png']);
    expect(count(content, 'Original artwork credit.')).toBe(1);
    expect(content.some(item => item.src === 'https://example.test/metadata-cover.jpg')).toBe(false);
  });

  it('uses an uncaptioned metadata cover only when source reading media is absent', async () => {
    const content = await extract({ header: '' });
    expect(content.filter(item => item.type === 'image')).toMatchObject([{ src: 'https://example.test/metadata-cover.jpg', caption: '', isFeatured: true }]);
  });
});
