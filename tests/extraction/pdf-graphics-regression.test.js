import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { extractPageGraphics } from '../../scripts/offscreen/pdf/utils/graphics-extractor.js';

let pdfjs;
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: async () => pdfjs }));
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn()
}));

beforeAll(() => {
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, console, URL, Uint8Array, Uint32Array, Int32Array,
    ArrayBuffer, TextEncoder, TextDecoder, ReadableStream, Promise, setTimeout, clearTimeout
  });
  vm.runInContext(readFileSync(new URL('../../lib/pdfjs/pdf.min.js', import.meta.url), 'utf8'), context);
  pdfjs = module.exports;
  context.module = { exports: {} };
  context.exports = context.module.exports;
  vm.runInContext(readFileSync(new URL('../../lib/pdfjs/pdf.worker.min.js', import.meta.url), 'utf8'), context);
  context.pdfjsWorker = context.module.exports;
});

function createPdf(stream, resources = '<< >>', extraObjects = []) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources ' + resources + ' /Contents 4 0 R >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
    ...extraObjects
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  pdf += offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new TextEncoder().encode(pdf);
}

async function graphics(stream, { resources, extraObjects, rotation = 0 } = {}) {
  const task = pdfjs.getDocument({ data: createPdf(stream, resources, extraObjects) });
  const document = await task.promise;
  try {
    const page = await document.getPage(1);
    return await extractPageGraphics(page, 1, page.getViewport({ scale: 1, rotation }));
  } finally {
    await document.destroy();
  }
}

const hasLine = (result, x1, y1, x2, y2) => result.allLines.some(line =>
  line.x1 === x1 && line.y1 === y1 && line.x2 === x2 && line.y2 === y2
);

describe('PDF graphics operator interpretation', () => {
  it('applies the current transformation matrix to actual PDF.js path coordinates', async () => {
    const result = await graphics('q 2 0 0 2 0 0 cm 10 100 m 30 100 l S Q');
    expect(hasLine(result, 20, 600, 60, 600)).toBe(true);
  });

  it('reads every subpath in a combined constructPath operation', async () => {
    const result = await graphics('10 100 m 80 100 l 10 120 m 80 120 l S');
    expect(hasLine(result, 10, 700, 80, 700)).toBe(true);
    expect(hasLine(result, 10, 680, 80, 680)).toBe(true);
    expect(result.allLines).toHaveLength(2);
  });

  it('extracts all four borders of a stroked rectangle', async () => {
    const result = await graphics('10 100 100 40 re S');
    expect(result.allLines).toHaveLength(4);
    expect(hasLine(result, 10, 700, 110, 700)).toBe(true);
    expect(hasLine(result, 110, 700, 110, 660)).toBe(true);
  });

  it('discards paths that are ended without painting', async () => {
    expect((await graphics('10 100 m 80 100 l n')).allLines).toEqual([]);
  });

  it('consumes curve arguments without turning their control points into straight borders', async () => {
    const result = await graphics('10 10 m 20 20 30 30 40 40 c 80 40 l S');
    expect(result.allLines).toHaveLength(1);
    expect(hasLine(result, 40, 760, 80, 760)).toBe(true);
  });

  it('restores the graphics matrix after a saved state', async () => {
    const result = await graphics('q 2 0 0 2 0 0 cm 10 100 m 30 100 l S Q 10 100 m 30 100 l S');
    expect(hasLine(result, 20, 600, 60, 600)).toBe(true);
    expect(hasLine(result, 10, 700, 30, 700)).toBe(true);
  });

  it('preserves thin filled rectangles used as underlines', async () => {
    const result = await graphics('10 100 100 1 re f');
    expect(result.allLines.some(line => line.x1 === 10 && line.x2 === 110)).toBe(true);
  });

  it('applies and restores a Form XObject matrix', async () => {
    const form = '10 10 m 40 10 l S';
    const result = await graphics('/Fm0 Do 5 50 m 50 50 l S', {
      resources: '<< /XObject << /Fm0 5 0 R >> >>',
      extraObjects: ['<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [2 0 0 2 20 30] /Resources << >> /Length ' + form.length + ' >>\nstream\n' + form + '\nendstream']
    });
    expect(hasLine(result, 40, 750, 100, 750)).toBe(true);
    expect(hasLine(result, 5, 750, 50, 750)).toBe(true);
  });

  it('uses the viewport rotation for border coordinates', async () => {
    const result = await graphics('10 100 m 80 100 l S', { rotation: 90 });
    expect(hasLine(result, 100, 10, 100, 80)).toBe(true);
  });

  it('starts a Form bounding-box clip with a fresh path', async () => {
    const form = '10 10 m 40 10 l S';
    const result = await graphics('5 50 m 50 50 l /Fm0 Do', {
      resources: '<< /XObject << /Fm0 5 0 R >> >>',
      extraObjects: ['<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << >> /Length ' + form.length + ' >>\nstream\n' + form + '\nendstream']
    });
    expect(hasLine(result, 10, 790, 40, 790)).toBe(true);
    expect(hasLine(result, 5, 750, 50, 750)).toBe(false);
  });
});
