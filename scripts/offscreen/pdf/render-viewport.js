import { createPdfError } from '../../utils/pdf-errors.js';

const MAX_PIXELS = 2 ** 25;
const MAX_DIMENSION = 32767;

/** Fit a complete page within the PDF.js desktop viewer's canvas budget. */
export function getPdfRenderViewport(page, scale) {
  const valid = value => Number.isFinite(value) && value > 0;
  if (!valid(scale)) throw createPdfError('Invalid PDF render scale', 'errorPdfRenderFailed');
  let viewport = page.getViewport({ scale });
  if (!valid(viewport.width) || !valid(viewport.height)) throw createPdfError('Invalid PDF page dimensions', 'errorPdfRenderFailed');
  let factor = Math.min(1, MAX_DIMENSION / viewport.width, MAX_DIMENSION / viewport.height);
  const area = (viewport.width * factor) * (viewport.height * factor);
  if (area > MAX_PIXELS) factor *= Math.sqrt(MAX_PIXELS / area);
  const measure = viewport => {
    const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
    return valid(width) && valid(height) && width <= MAX_DIMENSION && height <= MAX_DIMENSION && width * height <= MAX_PIXELS
      ? { viewport, width, height } : null;
  };
  const candidate = measure(factor === 1 ? viewport : page.getViewport({ scale: scale * factor }));
  if (candidate) return candidate;
  let low = 0, high = factor, result = null;
  for (let bit = 0; bit < 53; bit++) {
    const middle = (low + high) / 2;
    const candidate = measure(page.getViewport({ scale: scale * middle }));
    if (candidate) { low = middle; result = candidate; }
    else high = middle;
  }
  if (!result) throw createPdfError('PDF page cannot fit the render canvas', 'errorPdfRenderFailed');
  return result;
}
