import { readZipEntries } from '../helpers/zip-entries.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { contentToPlainText, splitTextIntoChunks, AUDIO_CONFIG } from '../../scripts/generation/audio-prep.js';
import { validateAudioParams } from '../../scripts/generation/audio-helpers.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/images.js', () => ({ imageToBase64: vi.fn(async () => null), processImagesInBatches: vi.fn(async () => []), embedImages: vi.fn(async html => html) }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: vi.fn(async () => 'en'), tSync: vi.fn(key => key) }));

const epubEntry = (bytes, filename) => readZipEntries(bytes)[filename].toString('utf8');

const base = { title: 'Sample article', author: 'Example & Company', language: 'en', sourceUrl: 'https://example.org/article' };
let createObjectURL, revokeObjectURL;
beforeEach(() => {
  vi.clearAllMocks();
  global.chrome.storage.local.get.mockResolvedValue({});
  global.chrome.downloads.download = vi.fn(async () => 7);
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample-document');
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { createObjectURL.mockRestore(); revokeObjectURL.mockRestore(); });

describe('document content integrity', () => {
  it('preserves text-only list items in audio and PDF output', () => {
    const content = [{ type: 'list', ordered: false, items: [{ text: 'First item' }, { html: '<strong>Second item</strong>' }] }];
    expect(contentToPlainText(content)).toContain('First item');
    expect(contentToPlainText(content)).toContain('Second item');
    const html = buildHtmlForPdf(content, 'Sample', '', '');
    expect(html).toContain('First item');
    expect(html).toContain('Second item');
  });

  it('accepts offline narration without an AI or TTS key', async () => {
    await expect(validateAudioParams({ content: [{ type: 'paragraph', text: 'Sample' }] }, 'offline')).resolves.toBeUndefined();
    await expect(validateAudioParams({ content: [{ type: 'paragraph', text: 'Sample' }] }, 'openai')).rejects.toThrow();
  });

  it.each(['a'.repeat(15017), '\u754c'.repeat(15017), '\u{1F30D}'.repeat(7507)])('bounds continuous narration without losing characters', text => {
    const chunks = splitTextIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.text.length <= AUDIO_CONFIG.MAX_CHUNK_SIZE)).toBe(true);
    expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
    expect(chunks.every(chunk => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk.text))).toBe(true);
  });

  it('keeps EPUB text, inline formatting, and URL query parameters', async () => {
    const content = [{ type: 'paragraph', html: 'A <strong>formatted</strong> link: <a href="https://example.org/search?a=1&amp;b=2">A &amp; B</a>' }];
    const blob = await generateEpub({ ...base, content });
    const xml = epubEntry(await blob.arrayBuffer(), 'OEBPS/content.xhtml');
    const document = new JSDOM(xml, { contentType: 'application/xhtml+xml', url: 'https://example.org/' }).window.document;
    expect(document.querySelector('.author').textContent).toBe(base.author);
    expect(document.querySelector('strong').textContent).toBe('formatted');
    const link = [...document.querySelectorAll('a')].find(a => a.textContent === 'A & B');
    expect(link?.getAttribute('href')).toBe('https://example.org/search?a=1&b=2');
  });

  it.each([
    ['Station%20readout.pdf', 'Station readout.pdf'],
    ['Station%FFreadout.pdf', 'Station%FFreadout.pdf']
  ])('exports only the basename of a local PDF source: %s', async (encoded, basename) => {
    const sourceUrl = `file:///C:/ProjectSamples/local-folders/${encoded}#page=4`;
    const content = [{ type: 'paragraph', format: 'text', text: 'A complete independent description of the measurement.' }];
    const data = { ...base, sourceUrl, content };
    const epub = await generateEpub(data);
    const entries = readZipEntries(await epub.arrayBuffer());
    const opf = new JSDOM(entries['OEBPS/content.opf'].toString('utf8'), { contentType: 'application/xml' });
    try {
      const sources = opf.window.document.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'source');
      expect([...sources].map(node => node.textContent)).toEqual([basename]);
    } finally {
      opf.window.close();
    }
    const documents = [
      buildHtmlForPdf(content, base.title, base.author, '', sourceUrl),
      await generateMarkdown(data),
      await (await generateFb2(data)).text(),
      entries['OEBPS/content.xhtml'].toString('utf8')
    ];
    for (const document of documents) expect(document).toContain(basename);
    for (const text of [...documents, ...Object.values(entries).map(bytes => bytes.toString('utf8'))]) {
      expect(text).not.toMatch(/file:\/\/|local-folders|#page=4/);
    }
  });

  it('preserves a web document source in EPUB metadata and the visible source link', async () => {
    const sourceUrl = 'https://example.org/report?year=2026&region=east';
    const content = [{ type: 'paragraph', format: 'text', text: 'The body of the field report.' }];
    const epub = await generateEpub({ ...base, sourceUrl, content });
    const bytes = await epub.arrayBuffer();
    const packageDocument = new JSDOM(epubEntry(bytes, 'OEBPS/content.opf'), { contentType: 'application/xml' });
    const contentDocument = new JSDOM(epubEntry(bytes, 'OEBPS/content.xhtml'), { contentType: 'application/xml' });
    try {
      const sources = packageDocument.window.document.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'source');
      expect([...sources].map(node => node.textContent)).toEqual([sourceUrl]);
      expect(contentDocument.window.document.querySelector('.source a').getAttribute('href')).toBe(sourceUrl);
    } finally {
      packageDocument.window.close();
      contentDocument.window.close();
    }
  });

  it('writes valid EPUB XML for source identifiers and strips executable markup', async () => {
    const content = [
      { type: 'heading', level: 2, id: 'section" data-extra="value', text: 'First section' },
      { type: 'heading', level: 3, id: 'next', text: 'Next section' },
      { type: 'paragraph', html: '<span onclick="alert(1)">Visible text</span><a href="javascript:alert(2)">Unsafe link</a>' },
      { type: 'image', src: 'https://example.org/image.png?x=" onerror="alert(3)', alt: 'Example image' }
    ];
    const blob = await generateEpub({ ...base, content, generateToc: true });
    for (const name of ['OEBPS/content.xhtml', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/content.opf']) {
      const xml = epubEntry(await blob.arrayBuffer(), name);
      const document = new JSDOM(xml, { contentType: 'application/xml', url: 'https://example.org/' }).window.document;
      expect(document.querySelector('script, [onclick], [onerror], [data-extra]') === null).toBe(true);
      expect([...document.querySelectorAll('[href]')].some(node => /^javascript:/i.test(node.getAttribute('href')))).toBe(false);
    }
  });

  it('keeps FB2 links valid and removes executable attributes', async () => {
    const blob = await generateFb2({ ...base, content: [{ type: 'paragraph', html: '<strong onclick="alert(1)">Sample</strong> <a href="javascript:alert(2)">Link</a> <a href="https://example.org/search?a=1&amp;b=2">Query</a>' }] });
    const document = new JSDOM(await blob.text(), { contentType: 'application/xml', url: 'https://example.org/' }).window.document;
    expect(document.querySelector('[onclick]') === null).toBe(true);
    const links = [...document.querySelectorAll('a')];
    expect(links.some(node => /^javascript:/i.test(node.getAttribute('l:href')))).toBe(false);
    expect(links.find(node => node.textContent === 'Query')?.getAttribute('l:href')).toBe('https://example.org/search?a=1&b=2');
  });
});
