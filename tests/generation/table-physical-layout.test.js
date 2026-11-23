// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { extractAutomaticallyInlined } from '../../scripts/extraction/automatic.js';
import { renderTableHtml, verifiedTableLayout, flatTableProjection } from '../../scripts/generation/document-content.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { preparePdfLayout } from '../../scripts/generation/pdf-layout.js';

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

  it('preserves authored table destinations and header associations from source through PDF records and EPUB', async () => {
    const url = 'https://example.com/survey';
    const source = new JSDOM(`<!doctype html><main><h1>Field survey</h1>
      <p>Review the <a href="#flow">flow definition</a> and <a href="#length">length definition</a>
      before examining the independent measurements recorded at each observation station.</p>
      <table id="survey"><colgroup span="1"></colgroup><colgroup><col span="2"></colgroup>
        <thead><tr><th scope="col">Station</th><th scope="col" id="length">Length</th><th scope="col" id="flow">Flow</th></tr></thead>
        <tbody><tr><td>North</td><td headers="flow absent flow">27</td><td headers="">31</td></tr></tbody></table>
      <p>The inspection team recorded two more surveys at other locations in the same region.</p></main>`,
    { url, runScripts: 'outside-only' });
    let print;
    try {
      const extract = source.window.eval(`(${extractAutomaticallyInlined.toString()})`);
      const { content, title } = await extract(url, false, { articleContainer: 'main', content: 'main' });
      const html = buildHtmlForPdf(content, title, '', '<style></style>', url);
      print = new JSDOM(html, { runScripts: 'outside-only' });
      const { document } = print.window;
      const grid = document.querySelector('table');
      const checkGrid = table => {
        expect(table.id).toBe('survey');
        expect([...table.querySelectorAll('colgroup')].map(group => group.getAttribute('span'))).toEqual(['1', '2']);
        expect([...table.querySelectorAll('td')].map(cell => cell.getAttribute('headers'))).toEqual([null, 'flow', '']);
        expect(table.querySelector('th#flow').textContent).toBe('Flow');
      };
      checkGrid(grid);
      const chapter = await epubContent(await generateEpub({ title, content, sourceUrl: url, language: 'en' }));
      const epub = new DOMParser().parseFromString(chapter, 'application/xhtml+xml');
      expect(epub.querySelector('parsererror')).toBeNull();
      checkGrid(epub.querySelector('table'));
      expect(epub.querySelector('a[href="#flow"]').textContent).toBe('flow definition');

      print.window.matchMedia = () => ({ matches: true });
      const article = document.querySelector('article');
      article.getBoundingClientRect = () => ({ top: 0, bottom: 300, width: 756, height: 300 });
      grid.parentElement.getBoundingClientRect = () => ({ width: 756 });
      grid.getBoundingClientRect = () => ({ width: 1600 });
      const layout = await print.window.eval(`(${preparePdfLayout.toString()})(8.27,"multi",11.69)`);
      expect(layout.tableLayouts[0].mode).toBe('records');
      expect([...document.querySelectorAll('dt')].map(cell => cell.textContent)).toEqual(['Station', 'Flow', '3']);
      expect([...document.querySelectorAll('dd')].map(cell => cell.textContent)).toEqual(['North', '27', '31']);
      expect(document.querySelector('.pdf-table-records #length').textContent).toBe('Length');
      expect(document.querySelectorAll('#flow')).toHaveLength(1);
      expect(document.querySelector('a[href="#length"]').textContent).toBe('length definition');
    } finally {
      print?.window.close();
      source.window.close();
    }
  });

  it('preserves the first authored header destination when other references are hidden, foreign, or invalid', async () => {
    const url = 'https://example.com/observations';
    const page = new JSDOM(`<!doctype html><main><h1>Field observations</h1>
      <p>These measurements provide a useful comparison between stations affected by several independent weather systems.</p>
      <table id="readings">
        <thead><tr><th id="level" scope="COL">First heading</th><th id="level" scope="diagonal">Second heading</th>
          <th id="hidden" style="visibility:hidden">Hidden heading</th></tr></thead>
        <tbody><tr><td headers="level hidden outside alias">8</td><td headers="outside">9</td><td><a name="alias">Note</a></td></tr></tbody></table>
      <table id="another"><thead><tr><th id="outside">Foreign heading</th></tr></thead><tbody><tr><td>10</td></tr></tbody></table>
      <p>The inspectors made separate measurements during the following two weeks with independent equipment.</p></main>`,
    { url, runScripts: 'outside-only' });
    try {
      const extract = page.window.eval(`(${extractAutomaticallyInlined.toString()})`);
      const { content, title } = await extract(url, false, { articleContainer: 'main', content: 'main' });
      const html = buildHtmlForPdf(content, title, '', '<style></style>', url);
      const document = new DOMParser().parseFromString(html, 'text/html');
      expect(document.querySelector('#readings #level').textContent).toBe('First heading');
      expect(document.querySelectorAll('#level')).toHaveLength(1);
      expect(document.querySelector('#level').getAttribute('scope')).toBe('col');
      expect(document.querySelector('#readings [scope="diagonal"]')).toBeNull();
      expect(document.querySelector('#readings #hidden')).toBeNull();
      expect([...document.querySelectorAll('#readings td')].map(cell => cell.getAttribute('headers'))).toEqual(['level', '', null]);
      expect(document.querySelector('#another #outside').textContent).toBe('Foreign heading');
    } finally {
      page.window.close();
    }
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
