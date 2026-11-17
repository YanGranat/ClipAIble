// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { escapeXml, normalizeXmlCharacters } from '../../scripts/generation/xml.js';

const XmlParser = DOMParser;
const bytes = blob => typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
function unzip(archive) {
  archive = Buffer.from(archive);
  const result = {}, end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < archive.readUInt16LE(end + 10); i++) {
    const nl = archive.readUInt16LE(offset + 28), xl = archive.readUInt16LE(offset + 30), cl = archive.readUInt16LE(offset + 32);
    const name = archive.subarray(offset + 46, offset + 46 + nl).toString('utf8'), local = archive.readUInt32LE(offset + 42), size = archive.readUInt32LE(offset + 20);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const data = archive.subarray(start, start + size);
    result[name] = (archive.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data).toString('utf8');
    offset += 46 + nl + xl + cl;
  }
  return result;
}
beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xml-document');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const native = text => ({ text, pageNum: 1, lines: [{ pageNum: 1, items: [{ str: text }] }] });
const formats = [['EPUB', generateEpub], ['FB2', generateFb2]];
async function output(generate, data, format) {
  const blob = await generate(data);
  const members = format === 'EPUB' ? unzip(await bytes(blob)) : { 'document.fb2': new TextDecoder().decode(await bytes(blob)) };
  const documents = {};
  for (const [name, xml] of Object.entries(members)) {
    if (!/\.(?:xml|xhtml|opf|ncx|fb2)$/.test(name)) continue;
    const document = new XmlParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')?.textContent, name).toBeUndefined();
    documents[name] = document;
  }
  if (format === 'EPUB') expect(Object.keys(documents).sort()).toEqual(['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/content.xhtml', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx']);
  return { document: documents[format === 'EPUB' ? 'OEBPS/content.xhtml' : 'document.fb2'], documents, members };
}

for (const [format, generate] of formats) {
  it(`${format} preserves native mathematical text, tables and unknown glyph markers as valid XML`, async () => {
    const math = 'x<q && r>s; 0 < k < n; α<β; A&B; ]]>; <b>literal markup</b>';
    const dirty = 'A\u0000B\u000fC\uFFFE D\uD800 E\uDC00 F😀𐐷中文';
    const expected = 'A�B�C� D� E� F😀𐐷中文';
    const heading = 'Native α<β & Ω > 0';
    const data = { title: 'Sensor \u0001 study 😀', author: 'Example \u0002Writer', language: 'en', generateToc: true, content: [
      { type: 'heading', level: 2, ...native(heading) }, { type: 'paragraph', ...native(math) },
      { type: 'paragraph', ...native(dirty) },
      { type: 'table', ...native('Native table'), headers: ['Limit', 'Reading'], hasHeaders: true, rows: [['k < n > m; a<b>c', 'α>β'], ['Unknown', '\u000f']] },
      { type: 'heading', level: 2, ...native('Second section') }, { type: 'paragraph', ...native('Final observation remains available.') }
    ] };
    const original = structuredClone(data);
    vi.stubGlobal('DOMParser', undefined);
    vi.stubGlobal('document', undefined);
    const { document, documents } = await output(generate, data, format);
    const text = document.documentElement.textContent;
    for (const value of [math, expected, heading, 'k < n > m; a<b>c', 'α>β', 'Sensor � study 😀']) expect(text).toContain(value);
    expect(text).not.toContain('\u000f');
    expect(text).not.toContain('epsilon');
    for (const document of Object.values(documents)) expect(document.documentElement.textContent).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    expect(data).toEqual(original);
  });

  it(`${format} preserves rich markup, named entities, literal comparisons and quoted attributes`, async () => {
    const rich = 'p < q and r > s. <strong>Bold</strong> <em>Italic</em> x<sup>2</sup> <a href="https://example.test/ref?a=1&amp;b=2" title="x > y"><em>linked</em></a> &copy; &#x1F600; literal &amp;copy; invalid &#xF;';
    const { document } = await output(generate, { title: 'Rich text study', language: 'en', content: [{ type: 'paragraph', text: rich, pageNum: 1 }] }, format);
    expect(document.documentElement.textContent).toContain('p < q and r > s. Bold Italic x2 linked © 😀 literal &copy; invalid �');
    expect(document.querySelector('strong')?.textContent).toBe('Bold');
    expect(document.querySelector(format === 'EPUB' ? 'em' : 'emphasis')?.textContent).toBe('Italic');
    expect(document.querySelector('sup')?.textContent).toBe('2');
    const link = [...document.querySelectorAll('a')].find(node => node.textContent === 'linked');
    expect(link).toBeDefined();
    expect(link.getAttribute(format === 'EPUB' ? 'href' : 'l:href')).toBe('https://example.test/ref?a=1&b=2');
    expect(link.querySelector(format === 'EPUB' ? 'em' : 'emphasis')?.textContent).toBe('linked');
    expect(link.namespaceURI).toBe(format === 'EPUB' ? 'http://www.w3.org/1999/xhtml' : 'http://www.gribuser.ru/xml/fictionbook/2.0');
    if (format === 'EPUB') expect(link.getAttribute('title')).toBe('x > y');
  });

  it(`${format} preserves code whitespace, valid non-BMP characters and literal entity syntax`, async () => {
    const code = 'if (a < b) {\r\n\treturn "😀 & 中 &#xF;";\r\n}';
    const { document } = await output(generate, { title: 'Code study', language: 'en', content: [{ type: 'code', text: code }] }, format);
    expect([...document.querySelectorAll('code')].map(node => node.textContent).join(format === 'FB2' ? '\n' : '')).toBe(code);
  });

  it(`${format} keeps encoded executable links inactive after XML serialization`, async () => {
    const links = ['javascript&#58;alert(1)', 'java&amp;#x73;cript:alert(1)', 'data&#58;text/html,example', 'vbscript&#58;example', 'about&#58;blank'];
    const text = links.map((href, index) => `<a href="${href}">Blocked ${index}</a>`).join(' ');
    const { document } = await output(generate, { title: 'Link study', language: 'en', content: [{ type: 'paragraph', text }] }, format);
    const anchors = [...document.querySelectorAll('a')].filter(node => node.textContent.startsWith('Blocked '));
    expect(anchors).toHaveLength(links.length);
    for (const node of anchors) expect(node.getAttribute(format === 'EPUB' ? 'href' : 'l:href')).toBe('#');
  });

  it(`${format} closes unfinished inline formatting without losing its text`, async () => {
    const { document } = await output(generate, { title: 'Inline study', language: 'en', content: [
      { type: 'paragraph', text: 'Before <strong>Bold <em>nested' }, { type: 'paragraph', text: 'Second <sup>raised' }
    ] }, format);
    expect(document.querySelector('strong')?.textContent).toBe('Bold nested');
    expect(document.querySelector(format === 'EPUB' ? 'em' : 'emphasis')?.textContent).toBe('nested');
    expect(document.querySelector('sup')?.textContent).toBe('raised');
  });
}

it('preserves every XML 1.0 Unicode boundary and replaces only forbidden code points', () => {
  const allowed = '\t\n\r \uD7FF\uE000\uFFFD\u{10000}\u{1FFFE}\u{10FFFF}';
  const forbidden = ['\u0000', '\u0008', '\u000B', '\u000C', '\u000E', '\u001F', '\uD800', '\uDC00', '\uFFFE', '\uFFFF'];
  expect(normalizeXmlCharacters(allowed)).toBe(allowed);
  expect(forbidden.map(normalizeXmlCharacters)).toEqual(forbidden.map(() => '�'));
  const document = new XmlParser().parseFromString(`<root>${escapeXml(allowed)}</root>`, 'application/xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.documentElement.textContent).toBe(allowed);
});
