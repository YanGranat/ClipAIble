import { readZipEntries } from '../helpers/zip-entries.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { filterFigureParagraphs } from '../../scripts/generation/content.js';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { generatePdf } from '../../scripts/generation/pdf.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { putPrintJob } from '../../scripts/api/print-storage.js';
import { imageToBase64, processImagesInBatches } from '../../scripts/utils/images.js';
import { JSDOM } from 'jsdom';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/images.js', () => ({ imageToBase64: vi.fn(async () => null), processImagesInBatches: vi.fn(async () => []), embedImages: vi.fn(async html => html) }));
vi.mock('../../scripts/api/print-storage.js', () => ({ putPrintJob: vi.fn(async () => {}), removePrintJob: vi.fn(async () => {}), prunePrintJobs: vi.fn(async () => 0) }));
vi.mock('../../scripts/locales.js', async original => ({ ...await original(), getUILanguage: vi.fn(async () => 'en'), tSync: vi.fn(key => key) }));

const figure = '<figure><img src="https://example.org/first.png"><figcaption>Figure caption.</figcaption></figure>';
const nextImage = { type: 'image', src: 'https://example.org/first.png', caption: 'Figure caption.' };
const paragraph = { type: 'paragraph', text: `<font>Prose before. ${figure} Prose after.</font>` };
let createUrl, revokeUrl;
beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.windows = { getCurrent: vi.fn(async () => ({ id: 1 })) };
  chrome.tabs.create = vi.fn(async () => ({ id: 17 }));
  chrome.tabs.get = vi.fn(async () => ({ id: 17 }));
  chrome.downloads.download = vi.fn(async () => 1);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('body { color: black; }')));
  createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample-document');
  revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { createUrl.mockRestore(); revokeUrl.mockRestore(); vi.unstubAllGlobals(); });

describe('figure paragraph conservation', () => {
  it('keeps prose around a duplicated figure and leaves the input unchanged', () => {
    const input = [paragraph, nextImage];
    const before = structuredClone(input);
    const result = filterFigureParagraphs(input);
    expect(result[0].text).toContain('Prose before.');
    expect(result[0].text).toContain('Prose after.');
    expect(result[0].text).not.toContain('Figure caption.');
    expect(result[1]).toEqual(nextImage);
    expect(input).toEqual(before);
  });
  it('removes a standalone duplicate figure', () => {
    expect(filterFigureParagraphs([{ type: 'paragraph', text: figure }, nextImage])).toEqual([nextImage]);
  });
  it.each([
    [paragraph, { ...nextImage, src: 'https://example.org/second.png' }],
    [{ ...paragraph, text: figure.replace('first.png', 'image?id=first') }, { ...nextImage, src: 'https://example.org/image?id=second' }],
    [{ ...paragraph, text: figure.replace('</figcaption>', '</figcaption>Copyright credit.') }, nextImage],
    [paragraph, { ...nextImage, caption: 'Different caption.' }],
    [{ ...paragraph, text: figure.replace('first.png', 'image?a=1&amp;b=2') }, { ...nextImage, src: 'https://example.org/image?a=1&amp;b=2' }],
    [{ ...paragraph, text: figure.replace('Figure caption.', 'Literal &amp;amp; caption.') }, { ...nextImage, caption: 'Literal &amp; caption.' }],
    [{ ...paragraph, text: `<figure>${figure}<figcaption>Outer caption.</figcaption></figure>` }, nextImage],
    [{ ...paragraph, text: figure + figure }, nextImage]
  ])('keeps distinct figure content', (text, image) => {
    expect(filterFigureParagraphs([text, image])).toEqual([text, image]);
  });

  it('decodes an HTML image attribute once when comparing it with the canonical image URL', () => {
    const text = { type: 'paragraph', text: figure.replace('first.png', 'image?a=1&amp;b=2') };
    const image = { ...nextImage, src: 'https://example.org/image?a=1&b=2' };
    expect(filterFigureParagraphs([text, image])).toEqual([image]);
  });

  it.each([['Markdown', generateMarkdown], ['PDF', generatePdf], ['EPUB', generateEpub], ['FB2', generateFb2]])('%s preserves producer-style prose before and after a figure', async (name, generate) => {
    const result = await generate({ title: 'Sample article', content: [paragraph, nextImage], sourceUrl: 'https://example.org/article', language: 'en' });
    const output = name === 'EPUB' ? readZipEntries(await result.arrayBuffer())['OEBPS/content.xhtml'].toString('utf8') : name === 'PDF' ? putPrintJob.mock.calls[0][1].html
      : result instanceof Blob ? await result.text() : result;
    expect(output).toContain('Prose before.');
    expect(output).toContain('Prose after.');
  });

  it.each([['PDF', generatePdf], ['EPUB', generateEpub], ['FB2', generateFb2], ['Markdown', generateMarkdown]])(
    '%s preserves linked HTML, Markdown, and literal text in image captions', async (name, generate) => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
    vi.mocked(imageToBase64).mockResolvedValueOnce(png).mockResolvedValueOnce(png).mockResolvedValueOnce(png);
    vi.mocked(processImagesInBatches).mockImplementationOnce((items, _limit, _state, process) => Promise.all(items.map(process)));
    const content = [
      { type: 'image', src: png, caption: '<a href="/field_sensor_data">Field readings</a> from the <em>first trial</em>.' },
      { type: 'image', src: png, format: 'markdown', caption: 'Follow the [reading log](/log) for *details*.' },
      { type: 'image', src: png, format: 'text', caption: 'Preserve a < b & <em>literal text</em>.' },
      { type: 'image', src: png, alt: 'List element: <li>' }
    ];
    const result = await generate({ content, title: 'Measurement report', sourceUrl: 'https://example.org/report' });
    if (name === 'Markdown') {
      expect(result).toContain('[Field readings](https://example.org/field_sensor_data)');
      expect(result).toContain('[reading log](https://example.org/log)');
      expect(result).toContain(String.raw`Preserve a \< b & \<em\>literal text\</em\>.`);
      return;
    }
    const output = name === 'EPUB' ? readZipEntries(await result.arrayBuffer())['OEBPS/content.xhtml'].toString('utf8')
      : name === 'PDF' ? putPrintJob.mock.calls[0][1].html : await result.text();
    const doc = name === 'FB2' ? new JSDOM(output, { contentType: 'text/xml' }).window.document : JSDOM.fragment(output);
    const [html, markdown, literal, fallback] = doc.querySelectorAll(name === 'FB2' ? 'image + p > emphasis' : 'figcaption');
    const linkAttribute = name === 'FB2' ? 'l:href' : 'href';
    expect(html.querySelector('a').getAttribute(linkAttribute)).toBe('https://example.org/field_sensor_data');
    expect(html.querySelector('em, emphasis').textContent).toBe('first trial');
    expect(markdown.querySelector('a').getAttribute(linkAttribute)).toBe('https://example.org/log');
    expect(markdown.querySelector('em, emphasis').textContent).toBe('details');
    expect(literal.textContent).toBe(content[2].caption);
    expect(literal.childElementCount).toBe(0);
    if (name === 'PDF') expect(fallback.textContent).toBe(content[3].alt);
  });
});
