import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeImage } from '../../scripts/offscreen/image-rasterization.js';

describe('offscreen image decoder', () => {
  let image, canvas, revoke, create, draw, output;
  beforeEach(() => {
    revoke = vi.fn(); create = vi.fn(() => 'blob:owned-image'); draw = vi.fn();
    output = new Blob(['png output'], { type: 'image/png' });
    canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: callback => callback(output) };
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal('Image', class {
      constructor() { image = this; this.naturalWidth = 800; this.naturalHeight = 400; }
      set src(value) { this.currentSrc = value; if (value) queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('document', { createElement: () => canvas });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/bmp'])('validates %s without changing its encoded bytes', async type => {
    const blob = new Blob(['compatible bytes'], { type });
    await expect(rasterizeImage(blob)).resolves.toBe(blob);
    expect(draw).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith('blob:owned-image');
    expect(image.currentSrc).toBe('');
  });
  it.each(['image/svg+xml', 'image/webp', 'image/avif'])('normalizes %s to PNG and releases its canvas', async type => {
    let dimensions;
    draw.mockImplementation(() => { dimensions = [canvas.width, canvas.height]; });
    await expect(rasterizeImage(new Blob(['source'], { type }))).resolves.toBe(output);
    expect(dimensions).toEqual([800, 400]); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(revoke).toHaveBeenCalledOnce();
  });
  it('bounds enormous SVG geometry while retaining its aspect ratio', async () => {
    let dimensions;
    draw.mockImplementation(() => { dimensions = [canvas.width, canvas.height]; });
    const promise = rasterizeImage(new Blob(['source'], { type: 'image/svg+xml' }));
    image.naturalWidth = 100000; image.naturalHeight = 50000;
    await promise;
    expect(dimensions[0] * dimensions[1]).toBeLessThanOrEqual(2 ** 25);
    expect(dimensions[0]).toBeLessThanOrEqual(32767);
    expect(Math.abs(dimensions[0] / dimensions[1] - 2)).toBeLessThan(0.001);
  });
  it('rejects decode failures and revokes the object URL', async () => {
    const promise = rasterizeImage(new Blob(['corrupt raster'], { type: 'image/png' }));
    image.onload = () => image.onerror();
    await expect(promise).rejects.toMatchObject({ code: 'IMAGE_DECODE_FAILED' });
    expect(revoke).toHaveBeenCalledOnce();
  });
  it('aborts pending decoding without drawing or retaining an object URL', async () => {
    const controller = new AbortController();
    const promise = rasterizeImage(new Blob(['source'], { type: 'image/svg+xml' }), controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'IMAGE_CANCELLED' });
    expect(draw).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
  });
});
