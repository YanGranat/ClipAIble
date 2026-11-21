// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { renderTableHtml, verifiedTableLayout, flatTableProjection } from '../../scripts/generation/document-content.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { generateEpub } from '../../scripts/generation/epub.js';

const table = () => ({
  type: 'table', id: 'observations', cellFormat: 'html', hasHeaders: true,
  headers: ['<span id="group-label">Group</span>', 'Reading', 'Reading'],
  rows: [['<span>Group</span>', 'Dawn', 'Dusk'], ['North', '11', '19'], ['North', '23', '29']],
  layoutRows: [
    { group: 'head', groupStart: true, cells: [
      { column: 0, rowSpan: 2, colSpan: 1, header: true, scope: 'col' },
      { column: 1, rowSpan: 1, colSpan: 2, header: true, scope: 'colgroup' }
    ] },
    { group: 'head', cells: [
      { column: 1, rowSpan: 1, colSpan: 1, header: true, scope: 'col' },
      { column: 2, rowSpan: 1, colSpan: 1, header: true, scope: 'col' }
    ] },
    { group: 'body', groupStart: true, cells: [
      { column: 0, rowSpan: 2, colSpan: 1, header: true, scope: 'rowgroup' },
      { column: 1, rowSpan: 1, colSpan: 1, header: false },
      { column: 2, rowSpan: 1, colSpan: 1, header: false }
    ] },
    { group: 'body', cells: [
      { column: 1, rowSpan: 1, colSpan: 1, header: false },
      { column: 2, rowSpan: 1, colSpan: 1, header: false }
    ] }
  ]
});

it('projects compound headers without merging unrelated data or repeating owned header IDs', () => {
  const source = table(), before = structuredClone(source), result = flatTableProjection(source);
  expect(result.headers).toEqual(['<span id="group-label">Group</span>', 'Reading<br>Dawn', 'Reading<br>Dusk']);
  expect(result.rows).toEqual([['North', '11', '19'], ['North', '23', '29']]);
  expect(source).toEqual(before);
});

it('preserves a gray value in formats without table color and leaves the source grid intact', () => {
  const source = table();
  source.layoutRows[2].cells[1].muted = true;
  expect(flatTableProjection(source).rows).toEqual([['North', '11 (gray)', '19'], ['North', '23', '29']]);
  expect(source.rows[1][1]).toBe('11');
  expect(renderTableHtml(source)).toContain('<td class="table-muted">11</td>');
  expect(renderTableHtml(source)).not.toContain('(gray)');
});

function checkPhysicalTable(document) {
  const result = document.querySelector('table');
  expect(result.id).toBe('observations');
  expect(Array.from(result.tHead.rows, row => row.cells.length)).toEqual([2, 2]);
  expect(Array.from(result.tBodies[0].rows, row => row.cells.length)).toEqual([3, 2]);
  expect(result.tHead.rows[0].cells[0].rowSpan).toBe(2);
  expect(result.tHead.rows[0].cells[1].colSpan).toBe(2);
  expect(result.tHead.rows[0].cells[1].scope).toBe('colgroup');
  expect(result.tBodies[0].rows[0].cells[0].scope).toBe('rowgroup');
  expect(result.tBodies[0].rows[0].cells[0].rowSpan).toBe(2);
  expect(Array.from(result.querySelectorAll('th'), cell => cell.textContent)).toEqual(['Group', 'Reading', 'Dawn', 'Dusk', 'North']);
  expect(Array.from(result.querySelectorAll('td'), cell => cell.textContent)).toEqual(['11', '19', '23', '29']);
  expect(result.querySelectorAll('#group-label')).toHaveLength(1);
}

async function epubContent(blob) {
  const bytes = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result)); reader.onerror = reject; reader.readAsArrayBuffer(blob);
  });
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    const length = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (name === 'OEBPS/content.xhtml') {
      const local = bytes.readUInt32LE(offset + 42);
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const content = bytes.subarray(start, start + bytes.readUInt32LE(offset + 20));
      return (bytes.readUInt16LE(offset + 10) === 8 ? inflateRawSync(content) : content).toString('utf8');
    }
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  throw new Error('Missing EPUB content');
}

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:table-document');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Physical table layout', () => {
  it('renders grouped headers and row-spanning labels once without copying table values', () => {
    const source = table(), before = structuredClone(source);
    const layout = verifiedTableLayout(source);
    expect(layout.origins).toHaveLength(9);
    expect(layout.aliases).toHaveLength(3);
    checkPhysicalTable(new DOMParser().parseFromString(renderTableHtml(source), 'text/html'));
    expect(source).toEqual(before);
  });

  it('uses the same physical table in PDF HTML and actual EPUB chapter bytes', async () => {
    const source = table(), before = structuredClone(source);
    checkPhysicalTable(new DOMParser().parseFromString(buildHtmlForPdf([source], 'Observation report', '', '<style></style>', '', '', 'en'), 'text/html'));
    const chapter = await epubContent(await generateEpub({ title: 'Observation report', language: 'en', content: [source] }));
    const document = new DOMParser().parseFromString(chapter, 'application/xhtml+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    checkPhysicalTable(document);
    expect(source).toEqual(before);
  });

  it('preserves the declared headerless state and each format default for rows without header metadata', async () => {
    const source = { type: 'table', rows: [['Area', 'Count'], ['North', '7']] };
    const pdf = new DOMParser().parseFromString(buildHtmlForPdf([source], 'Observation report', '', '<style></style>', '', '', 'en'), 'text/html');
    expect(pdf.querySelectorAll('table th')).toHaveLength(0);
    const chapter = await epubContent(await generateEpub({ title: 'Observation report', language: 'en', content: [source] }));
    const epub = new DOMParser().parseFromString(chapter, 'application/xhtml+xml');
    expect(Array.from(epub.querySelectorAll('table th'), cell => cell.textContent)).toEqual(['Area', 'Count']);
    expect(renderTableHtml({ ...source, hasHeaders: false }, '', { assumeFirstRowHeader: true })).not.toContain('<th>');
  });

  it('preserves separate body row groups and a footer', () => {
    const source = { type: 'table', hasHeaders: true, headers: ['Area', 'Count'], rows: [['North', '7'], ['South', '9'], ['Total', '16']], layoutRows: [
      { group: 'head', cells: [{ column: 0, rowSpan: 1, colSpan: 1, header: true }, { column: 1, rowSpan: 1, colSpan: 1, header: true }] },
      { group: 'body', groupStart: true, cells: [{ column: 0, rowSpan: 1, colSpan: 1, header: true, scope: 'rowgroup' }, { column: 1, rowSpan: 1, colSpan: 1, header: false }] },
      { group: 'body', groupStart: true, cells: [{ column: 0, rowSpan: 1, colSpan: 1, header: true, scope: 'rowgroup' }, { column: 1, rowSpan: 1, colSpan: 1, header: false }] },
      { group: 'foot', groupStart: true, cells: [{ column: 0, rowSpan: 1, colSpan: 1, header: true, scope: 'row' }, { column: 1, rowSpan: 1, colSpan: 1, header: false }] }
    ] };
    const document = new DOMParser().parseFromString(renderTableHtml(source), 'text/html');
    const rendered = document.querySelector('table');
    expect(rendered.tBodies).toHaveLength(2);
    expect(rendered.tBodies[0].textContent).toBe('North7');
    expect(rendered.tBodies[1].textContent).toBe('South9');
    expect(rendered.tFoot.textContent).toBe('Total16');
  });

  it.each([
    source => { source.layoutRows[0].cells[1].colSpan = 8; },
    source => { source.layoutRows[0].cells[0].rowSpan = 3; },
    source => { source.layoutRows[1].cells[0].column = 0; },
    source => { source.layoutRows[1].cells[0].scope = 'side'; },
    source => { source.layoutRows[1].cells = []; },
    source => { source.rows[0][0] = 'Another group'; },
    source => { source.rows[0][0] = '<span id="other-label">Group</span>'; },
    source => { source.layoutRows[0].cells[0].rowSpan = 0; }
  ])('falls back to every canonical grid value when physical metadata is inconsistent', damage => {
    const source = table(); damage(source);
    expect(verifiedTableLayout(source)).toBeNull();
    const document = new DOMParser().parseFromString(renderTableHtml(source), 'text/html');
    expect(document.querySelectorAll('th,td')).toHaveLength(12);
    expect(document.querySelector('[rowspan],[colspan]')).toBeNull();
    expect(Array.from(document.querySelectorAll('td')).slice(-4).map(cell => cell.textContent)).toEqual(['19', 'North', '23', '29']);
  });

  it('does not treat literal text as HTML identity aliases', () => {
    const source = { type: 'table', cellFormat: 'text', hasHeaders: false, rows: [['<span id="a">Field</span>', '<span>Field</span>']],
      layoutRows: [{ group: 'body', cells: [{ column: 0, rowSpan: 1, colSpan: 2, header: false }] }] };
    expect(verifiedTableLayout(source)).toBeNull();
    const document = new DOMParser().parseFromString(renderTableHtml(source), 'text/html');
    expect(Array.from(document.querySelectorAll('td'), cell => cell.textContent)).toEqual(source.rows[0]);
  });
});
