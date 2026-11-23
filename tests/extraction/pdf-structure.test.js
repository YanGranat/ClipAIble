import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createInterleavedGraphicsPdf, createMixedLayoutPdf, createStructurePdf, mixedLayoutLane, mixedLayoutOracle, structureOracle } from '../helpers/pdf-fixture.js';
import { createReadingOrderPdf, readingOrderOracle } from '../helpers/pdf-reading-order.js';
import { createCapturePagesPdf, capturePageOracle } from '../helpers/pdf-capture-pages.js';
import { installPdfTestCompatibility } from '../helpers/pdf-test-compatibility.js';

let pdfjs;
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: async () => pdfjs }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
import { extractPdfContent } from '../../scripts/offscreen/pdf/extract.js';

beforeAll(async () => {
  installPdfTestCompatibility();
  vi.stubGlobal('DOMMatrix', class {});
  await import('../../lib/pdfjs/compatibility.mjs');
  pdfjs = await import('../../lib/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../lib/pdfjs/worker.mjs', import.meta.url).href;
});
afterEach(() => vi.unstubAllGlobals());

async function extract(options) {
  vi.stubGlobal('document', {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response(createStructurePdf(options), { status: 200 })));
  return extractPdfContent('https://example.com/survey.pdf');
}

describe('PDF structure conservation with the packaged parser', () => {
  it('preserves mixed page dimensions, table records and final-page text', async () => {
    const task = pdfjs.getDocument({ data: createCapturePagesPdf(), isEvalSupported: false });
    const pdf = await task.promise;
    try {
      expect(pdf.numPages).toBe(3);
      for (let index = 0; index < capturePageOracle.length; index++) {
        const page = await pdf.getPage(index + 1), oracle = capturePageOracle[index];
        const viewport = page.getViewport({ scale: 1 });
        expect([viewport.width, viewport.height]).toEqual([oracle.width, oracle.height]);
        const text = (await page.getTextContent()).items.map(item => item.str).filter(text => text.trim());
        expect(text).toEqual([`${index + 1}. ${oracle.title}`, `Final record for page ${index + 1}.`, 'Record', 'Value', 'Flag', 'A', '8', 'Keep', 'B', '13', 'Check']);
      }
    } finally { await task.destroy(); }
  });
  it('retains every cell, header, paragraph and heading in reading order', async () => {
    const result = await extract();
    expect(result).toMatchObject({ title: structureOracle.title, author: structureOracle.author });
    const tables = result.content.filter(element => element.type === 'table');
    expect(tables.map(table => table.rows)).toEqual(structureOracle.tables);
    expect(tables.map(table => [table.rowCount, table.columnCount, table.hasHeaders])).toEqual([[3, 3, true], [3, 3, true]]);
    expect(result.content.map(element => [element.type, element.text])).toEqual([
      ['heading', structureOracle.title],
      ['paragraph', structureOracle.paragraphs[0]],
      ['heading', structureOracle.headings[0]],
      ['paragraph', structureOracle.paragraphs[1]],
      ['table', structureOracle.tables[0].map(row => row.join(' ')).join('\n')],
      ['heading', structureOracle.headings[1]],
      ['paragraph', structureOracle.paragraphs[2]],
      ['table', structureOracle.tables[1].map(row => row.join(' ')).join('\n')],
      ['heading', structureOracle.headings[2]],
      ['paragraph', `${structureOracle.paragraphs[3]} Slanted field annotation.`]
    ]);
    expect(result.content.filter(element => element.type === 'heading').map(element => element.level)).toEqual([1, 2, 2, 2]);
    const tail = result.content.at(-1);
    expect(tail.lines.map(line => line.isItalic)).toEqual([false, true]);
    const fonts = [...new Set(result.content.flatMap(element => element.lines || []).flatMap(line => line.items || []).map(item => item.realFontName))];
    expect(fonts).toEqual(expect.arrayContaining(['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']));
  });

  it('keeps a fully italic heading while preserving surrounding ordinary paragraphs', async () => {
    const result = await extract({ italicHeading: true });
    const heading = result.content.find(element => element.text === structureOracle.headings[2]);
    expect(heading).toMatchObject({ type: 'heading', isItalic: true });
    expect(result.content.at(-1)).toMatchObject({ type: 'paragraph', text: `${structureOracle.paragraphs[3]} Slanted field annotation.` });
  });

  it('preserves text order across a blank page and two independent columns', async () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(createReadingOrderPdf(), { status: 200 })));
    const result = await extractPdfContent('https://example.com/notes.pdf');
    expect(result.title).toBe(readingOrderOracle.title);
    expect(result.content.map(element => [element.type, element.text])).toEqual([
      ['heading', readingOrderOracle.title], ['heading', readingOrderOracle.headings[0]],
      ['paragraph', readingOrderOracle.paragraphs[0].join(' ')],
      ['heading', readingOrderOracle.headings[1]], ['paragraph', readingOrderOracle.paragraphs[1].join(' ')],
      ['heading', readingOrderOracle.headings[2]], ['paragraph', readingOrderOracle.paragraphs[2].join(' ')]
    ]);
    expect(result.content.map(element => element.pageNum)).toEqual([1, 1, 1, 3, 3, 3, 3]);
  });


  it.each([7, 9])('keeps the full-width table between independently flowing text regions (%s lower-right lines)', async lowerRightLength => {
    vi.stubGlobal('document', {});
    const { title, introduction, conclusion, rows } = mixedLayoutOracle;
    const result = await extractPdfContent('https://example.test/layout.pdf', createMixedLayoutPdf(lowerRightLength).buffer);
    const tables = result.content.filter(item => item.type === 'table');
    expect(tables.map(table => table.rows)).toEqual([rows]);
    expect(result.title).toBe(title);
    const text = result.content.map(item => item.text).join(' ').replace(/\s+/g, ' ');
    expect(text).toBe([
      title, introduction, ...mixedLayoutLane('Upper', 'Left'), ...mixedLayoutLane('Upper', 'Right'),
      rows.flat().join(' '), ...mixedLayoutLane('Lower', 'Left'), ...mixedLayoutLane('Lower', 'Right', lowerRightLength), conclusion
    ].join(' '));
  });
  it('places image-only inserts from a mixed document between the original text pages', async () => {
    vi.stubGlobal('document', {});
    const preserveImagePage = vi.fn(async (page, pageNum) => {
      const content = await page.getOperatorList();
      const paints = content.fnArray.some(op => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.constructPath].includes(op));
      return paints ? { type: 'image', pageNum } : null;
    });
    const result = await extractPdfContent('https://example.com/survey.pdf', createInterleavedGraphicsPdf().buffer, { preserveImagePage });
    expect(preserveImagePage.mock.calls.map(([, number]) => number)).toEqual([2, 3, 4]);
    expect(result.content.map(item => [item.pageNum, item.type])).toEqual([
      [1, 'paragraph'], [2, 'image'], [3, 'image'], [5, 'paragraph']
    ]);
  });

  it('keeps the Automatic no-text error for an entirely graphic document', async () => {
    vi.stubGlobal('document', {});
    const preserveImagePage = vi.fn();
    const bytes = createInterleavedGraphicsPdf({ withText: false }).buffer;
    await expect(extractPdfContent('https://example.com/survey.pdf', bytes, { preserveImagePage }))
      .rejects.toMatchObject({ translationKey: 'errorPdfNoTextLayer' });
    expect(preserveImagePage).not.toHaveBeenCalled();
  });
});
