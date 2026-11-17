// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';

const bytes = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(Buffer.from(reader.result));
  reader.onerror = reject;
  reader.readAsArrayBuffer(blob);
});

async function epubContent(blob) {
  const archive = await bytes(blob);
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < archive.readUInt16LE(end + 10); index++) {
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    const length = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (name === 'OEBPS/content.xhtml') {
      const local = archive.readUInt32LE(offset + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const data = archive.subarray(start, start + archive.readUInt32LE(offset + 20));
      const method = archive.readUInt16LE(offset + 10);
      expect([0, 8]).toContain(method);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    offset += 46 + length + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  throw new Error('Missing EPUB content');
}

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:table-document');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const formats = [
  ['Markdown', generateMarkdown, value => value],
  ['EPUB', generateEpub, epubContent],
  ['FB2', generateFb2, async value => (await bytes(value)).toString('utf8')]
];

describe('table header conservation', () => {
  it.each(formats)('%s preserves separate headers, every data row and the input', async (name, generate, decode) => {
    const table = { type: 'table', headers: ['Sensor', 'Reading'], hasHeaders: true, rows: [['Station A', '0'], ['Station B', '12']] };
    const original = structuredClone(table);
    const output = await decode(await generate({ title: 'Table study', language: 'en', content: [table] }));
    for (const value of ['Sensor', 'Reading', 'Station A', 'Station B']) {
      expect(output.split(value).length - 1).toBe(1);
    }
    if (name === 'Markdown') {
      expect(output).toContain('| Station A | 0 |');
      expect(output).toContain('| Station B | 12 |');
    } else {
      const document = new DOMParser().parseFromString(output, 'application/xml');
      if (name === 'EPUB') {
        expect(Array.from(document.querySelectorAll('table th'), cell => cell.textContent)).toEqual(['Sensor', 'Reading']);
        expect(Array.from(document.querySelectorAll('table td'), cell => cell.textContent)).toEqual(['Station A', '0', 'Station B', '12']);
      } else {
        expect(Array.from(document.querySelectorAll('p'), paragraph => paragraph.textContent)).toEqual(expect.arrayContaining(['Sensor | Reading', 'Station A | 0', 'Station B | 12']));
      }
    }
    expect(table).toEqual(original);
    const html = buildHtmlForPdf([table], 'Table study', '', '<style></style>', '', '', 'en');
    expect(html).toContain('<th>Sensor</th>');
    expect(html).toContain('<td>Station A</td>');
  });

  it.each(formats)('%s keeps legacy headers supplied as the first row', async (name, generate, decode) => {
    const table = { type: 'table', hasHeaders: true, rows: [['Sensor', 'Reading'], ['Station A', '0']] };
    const output = await decode(await generate({ title: 'Table study', language: 'en', content: [table] }));
    for (const value of ['Sensor', 'Reading', 'Station A']) expect(output.split(value).length - 1).toBe(1);
  });

  it('keeps an explicitly headerless EPUB table as data', async () => {
    const output = await epubContent(await generateEpub({ title: 'Table study', language: 'en', content: [{ type: 'table', hasHeaders: false, rows: [['Station A', '0'], ['Station B', '12']] }] }));
    const document = new DOMParser().parseFromString(output, 'application/xhtml+xml');
    expect(document.querySelectorAll('table th')).toHaveLength(0);
    expect(Array.from(document.querySelectorAll('table td'), cell => cell.textContent)).toEqual(['Station A', '0', 'Station B', '12']);
  });
});
