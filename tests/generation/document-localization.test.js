// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { getDocumentLanguageTag, getLocaleFromLanguage, PDF_LOCALIZATION } from '../../scripts/utils/config.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';

const build = (text, language, title = '') => new DOMParser().parseFromString(buildHtmlForPdf([{ type: 'paragraph', text }], title, '', '<style></style>', '', '', language), 'text/html');
const bytes = blob => typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
function zipText(data, filename) {
  const archive = Buffer.from(data);
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < archive.readUInt16LE(end + 10); i++) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === filename) {
      const local = archive.readUInt32LE(offset + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const data = archive.subarray(start, start + archive.readUInt32LE(offset + 20));
      const method = archive.readUInt16LE(offset + 10);
      expect([0, 8]).toContain(method);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    offset += 46 + nameLength + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing EPUB member: ${filename}`);
}
afterEach(() => vi.restoreAllMocks());

describe('document language and metadata', () => {
  it.each([['ua', 'uk'], ['ua-UA', 'uk-UA'], ['uk', 'uk'], ['pt-BR', 'pt-BR'], ['ar', 'ar'], ['auto', 'und'], ['', 'und'], ['invalid locale', 'und']])('serializes %s as %s without selecting a UI language', (language, expected) => {
    expect(getDocumentLanguageTag(language)).toBe(expected);
    expect(build('Article text', language).documentElement.lang).toBe(expected);
  });

  it('uses the content language for number formatting and cardinal word forms', () => {
    expect(build('word', 'en').querySelector('.word-count').textContent).toBe('1 word');
    expect(build('word word', 'en').querySelector('.word-count').textContent).toBe('2 words');
    expect(build('слово '.repeat(21), 'ru').querySelector('.word-count').textContent).toBe('21 слово');
    expect(build('слово '.repeat(2), 'ua').querySelector('.word-count').textContent).toBe('2 слова');
    expect(build('Wort '.repeat(1234), 'de').querySelector('.word-count').textContent).toBe('1.234 Wörter');
    expect(build('mot '.repeat(1234), 'fr').querySelector('.word-count').textContent).toBe('1\u202f234 mots');
  });

  it('uses natural Ukrainian and Russian abstract headings', () => {
    expect(PDF_LOCALIZATION.ru.abstract).toBe('Краткое содержание');
    expect(PDF_LOCALIZATION.ua.abstract).toBe('Стислий виклад');
  });

  it.each([['zh','猫和狗','3 词'],['ja','猫と犬','3 語'],['zh','English 猫和狗','4 词'],['zh','mother-in-law猫','2 词'],['ja','スーパー','1 語'],['ja','か\u3099','1 語'],['zh','猫，😀狗','2 词'],['en','mother-in-law co-operate 42','3 words'],['invalid locale','猫和狗','3 words'],['__proto__','猫和狗','3 words'],['constructor','猫和狗','3 words']])('counts %s content without losing its word boundaries', (language,text,expected) => {
    expect(build(text,language).querySelector('.word-count')?.textContent).toBe(expected);
  });

  it.each(['__proto__', 'constructor', 'unknown locale'])('uses a real fallback locale for %s', language => {
    expect(getLocaleFromLanguage(language)).toBe('en-US');
  });

  it.each(['','... ! —','😀 🎉'])('does not count non-word content as words: %s', text => {
    expect(build(text,'zh').querySelector('.word-count')).toBeNull();
  });

  it('keeps Ukrainian content language in actual EPUB and FB2 output when the UI is English', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample-document');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
    const data = { title: 'Sample article', language: 'ua', generateToc: true, content: [{ type: 'heading', level: 2, text: 'First section' }, { type: 'paragraph', text: 'Текст статті.' }, { type: 'heading', level: 2, text: 'Second section' }, { type: 'paragraph', text: 'Інший текст.' }] };
    const epub = await bytes(await generateEpub(data));
    const opf = zipText(epub, 'OEBPS/content.opf');
    expect(new DOMParser().parseFromString(opf, 'application/xml').getElementsByTagName('dc:language')[0].textContent).toBe('uk');
    for (const filename of ['OEBPS/content.xhtml', 'OEBPS/nav.xhtml']) {
      const content = new DOMParser().parseFromString(zipText(epub, filename), 'application/xml');
      expect(content.querySelector('parsererror')).toBeNull();
      expect(content.documentElement.getAttribute('xml:lang')).toBe('uk');
    }
    const fb2 = new DOMParser().parseFromString(new TextDecoder().decode(await bytes(await generateFb2(data))), 'application/xml');
    expect(fb2.querySelector('parsererror')).toBeNull();
    expect(fb2.getElementsByTagName('lang')[0].textContent).toBe('uk');
    expect(fb2.documentElement.textContent).toContain('Текст статті.');
  });
});
