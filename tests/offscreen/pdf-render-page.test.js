import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPdfPage } from '../../scripts/offscreen/pdf/render-page.js';

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
});
