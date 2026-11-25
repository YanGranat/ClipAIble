import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPdfEquationRegions, renderPdfPage } from '../../scripts/offscreen/pdf/render-page.js';

afterEach(() => vi.unstubAllGlobals());

function fixture({ blank = false } = {}) {
  const pixels = new Uint8ClampedArray(8 * 7 * 4).fill(255);
  if (!blank) {
    pixels[(2 * 8 + 1) * 4] = 205;
    pixels[(5 * 8 + 6) * 4] = 199;
  }
  const context = {
    getImageData: vi.fn(() => ({ data: pixels })),
    drawImage: vi.fn()
  };
  const created = [];
  vi.stubGlobal('document', { createElement: vi.fn(() => {
    const canvas = { width: 0, height: 0, getContext: () => context,
      toBlob: callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })) };
    created.push(canvas);
    return canvas;
  }) });
  const page = {
    getViewport: () => ({ width: 8, height: 7 }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  };
  return { page, context, created, operation: { check() {}, track() {} } };
}

describe('Shared PDF page rasterizer', () => {
  it('keeps all marks and relative positions while removing empty margins around a graphic insert', async () => {
    const { page, context, created, operation } = fixture();
    await expect(renderPdfPage(page, 2, 2, operation, true)).resolves.toMatchObject({ width: 6, height: 4 });
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(created[0], 1, 2, 6, 4, 0, 0, 6, 4);
    expect(created.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('skips a fully white graphic page without encoding or copying its pixels', async () => {
    const { page, context, created, operation } = fixture({ blank: true });
    await expect(renderPdfPage(page, 2, 2, operation, true)).resolves.toBeNull();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ width: 0, height: 0 });
  });

  it('retains the full coordinate space for vision requests', async () => {
    const { page, context, operation } = fixture();
    await expect(renderPdfPage(page, 2, 2, operation)).resolves.toMatchObject({ width: 8, height: 7 });
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders the source page once and crops only equations with an unobstructed border', async () => {
    const { page, context, created, operation } = fixture({ blank: true });
    page.getViewport = () => ({ width: 8, height: 7, scale: 2 });
    vi.stubGlobal('pdfjsLib', { getDocument: vi.fn(), AnnotationMode: { DISABLE: 0 } });
    context.getImageData.mockImplementation((x, y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      if (x === 0 && y === 0) data[0] = 0;
      if (x === 2 && y === 2) data[(width + 1) * 4] = 0;
      return { data };
    });
    await expect(renderPdfEquationRegions(page, 2, operation, [
      { left: 0, top: 0, right: 1.5, bottom: 1.5 },
      { left: 1, top: 1, right: 4, bottom: 3.5 },
      { left: 2, top: 2, right: 4, bottom: 3.5 }
    ])).resolves.toMatchObject([null, { width: 6, height: 5 }, null]);
    expect(page.render).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(created[0], 2, 2, 6, 5, 0, 0, 6, 5);
    expect(created.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
});
