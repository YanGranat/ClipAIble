import { describe, expect, it, vi } from 'vitest';
import { getPdfRenderViewport } from '../../scripts/offscreen/pdf/render-viewport.js';

const page = (width, height) => ({ getViewport: vi.fn(({ scale }) => ({ scale, width: width * scale, height: height * scale, transform: [scale, 0, 0, -scale, 0, height * scale] })) });
describe('PDF whole-page render canvas', () => {
  it('preserves the requested viewport for ordinary page sizes', () => {
    const pdfPage = page(600, 800);
    expect(getPdfRenderViewport(pdfPage, 2)).toEqual({ viewport: { scale: 2, width: 1200, height: 1600, transform: [2, 0, 0, -2, 0, 1600] }, width: 1200, height: 1600 });
    expect(pdfPage.getViewport).toHaveBeenCalledOnce();
  });
  it.each([[40000, 200], [200, 40000], [12000, 12000], [1e200, 1e200], [1, 1e9]])('scales down the whole %s by %s page within pixel and dimension limits', (width, height) => {
    const result = getPdfRenderViewport(page(width, height), 2);
    expect(result.width).toBeLessThanOrEqual(32767); expect(result.height).toBeLessThanOrEqual(32767);
    expect(result.width * result.height).toBeLessThanOrEqual(2 ** 25);
    expect(result.viewport.scale).toBeLessThan(2);
    expect(result.viewport.width / result.viewport.height).toBeCloseTo(width / height, 8);
    expect(result.width).toBeGreaterThanOrEqual(result.viewport.width);
    expect(result.height).toBeGreaterThanOrEqual(result.viewport.height);
    expect(result.viewport.transform.at(-1)).toBe(result.viewport.height);
  });
  it('rounds backing dimensions outward while respecting the final integer pixel budget', () => {
    const result = getPdfRenderViewport(page(12345.6, 9876.5), 2);
    expect(result.width * result.height).toBeLessThanOrEqual(2 ** 25);
    expect(result.width).toBe(Math.ceil(result.viewport.width)); expect(result.height).toBe(Math.ceil(result.viewport.height));
  });
  it.each([[4051, 8283], [8283, 4051]])('renders an integer page just above the pixel budget: %s by %s', (width, height) => {
    let result;
    expect(() => { result = getPdfRenderViewport(page(width, height), 1); }).not.toThrow();
    expect(result.width * result.height).toBeLessThanOrEqual(2 ** 25);
    expect(result.viewport.scale).toBeGreaterThan(0.99);
    expect(result.width).toBeGreaterThanOrEqual(result.viewport.width);
    expect(result.height).toBeGreaterThanOrEqual(result.viewport.height);
  });
  it('keeps recomputed floating-point page dimensions inside the integer limit', () => {
    const result = getPdfRenderViewport(page(379.6488913575391, 2573964.549536094), 0.015019567817417577);
    expect(result.height).toBe(32767);
    expect(result.width).toBeGreaterThanOrEqual(result.viewport.width);
    expect(result.height).toBeGreaterThanOrEqual(result.viewport.height);
  });
  it.each([2.1, 3])('keeps fractional scaling within the dimension budget: %s', scale => {
    const result = getPdfRenderViewport(page(100, 17000), scale);
    expect(result.height).toBe(32767);
    expect(result.width).toBeGreaterThanOrEqual(result.viewport.width);
    expect(result.height).toBeGreaterThanOrEqual(result.viewport.height);
  });
  it.each([0, -1, Infinity, NaN])('rejects a nonpositive or nonfinite render scale: %s', scale => {
    const pdfPage = page(600, 800);
    expect(() => getPdfRenderViewport(pdfPage, scale)).toThrow('Invalid PDF render scale');
    expect(pdfPage.getViewport).not.toHaveBeenCalled();
  });
  it.each([[0, 100], [-1, 100], [Infinity, 100], [100, NaN]])('rejects invalid page geometry: %s by %s', (width, height) => {
    expect(() => getPdfRenderViewport(page(width, height), 2)).toThrow('Invalid PDF page dimensions');
  });
});
