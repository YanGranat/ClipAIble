// @ts-check
import { CONFIG } from '../../utils/config.js';
import { createPdfError } from '../../utils/pdf-errors.js';
import { getPdfRenderViewport } from './render-viewport.js';
import { loadPdfJs } from './utils/pdf-loader.js';

/** Read visible bounds before encoding without keeping a full second pixel buffer. */
function findVisibleBounds(context, width, height) {
  const rows = Math.max(1, Math.floor(65536 / width));
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += rows) {
    const count = Math.min(rows, height - y);
    const { data } = context.getImageData(0, y, width, count);
    for (let row = 0; row < count; row++) {
      for (let x = 0; x < width; x++) {
        const i = (row * width + x) * 4;
        if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y + row);
        bottom = y + row;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function containsIsolatedInk(context, x, y, width, height) {
  const { data } = context.getImageData(x, y, width, height);
  let ink = false;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] >= 245 && data[index + 1] >= 245 && data[index + 2] >= 245) continue;
    const pixel = index / 4, column = pixel % width;
    if (pixel < width || pixel >= (height - 1) * width || column === 0 || column === width - 1) return false;
    ink = true;
  }
  return ink;
}

/** @param {HTMLCanvasElement} canvas @param {ReturnType<typeof import('./render-operations.js').startPdfRender>} operation */
async function encodePdfCanvas(canvas, operation, mimeType = 'image/jpeg') {
  /** @type {Blob | null} */
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.92));
  operation.check();
  if (!blob?.size) throw createPdfError('PDF page encoding failed', 'errorPdfRenderFailed');
  return { blob, width: canvas.width, height: canvas.height };
}

/** @param {HTMLCanvasElement} canvas */
function cropCanvas(canvas, x, y, width, height) {
  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = height;
  const context = cropped.getContext('2d', { alpha: false });
  if (!context) {
    cropped.width = cropped.height = 0;
    throw createPdfError('PDF crop canvas is unavailable', 'errorPdfRenderFailed');
  }
  context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return cropped;
}

export async function renderPdfPage(page, pageNum, scale, operation, trimBlankMargins = false, selectRegion, mimeType = 'image/jpeg') {
  const result = await renderPdfPageImpl(page, pageNum, scale, operation, trimBlankMargins, selectRegion, undefined, mimeType);
  return result && 'blob' in result ? result : null;
}

export async function renderPdfEquationRegions(page, pageNum, operation, equationRegions) {
  const result = await renderPdfPageImpl(page, pageNum, 2, operation, false, undefined, equationRegions);
  return result?.regions || [];
}

/**
 * Render a single caller-owned PDF.js page using the shared viewport and task lifetime.
 * @param {Object} page
 * @param {number} pageNum
 * @param {number} scale
 * @param {ReturnType<typeof import('./render-operations.js').startPdfRender>} operation
 * @param {boolean} [trimBlankMargins]
 * @param {(viewport: any, width: number, height: number) => Promise<any>} [selectRegion]
 * @param {Array<{left: number, right: number, top: number, bottom: number}>} [equationRegions] - known regions at page scale 1
 */
async function renderPdfPageImpl(page, pageNum, scale, operation, trimBlankMargins = false, selectRegion, equationRegions = undefined, mimeType = 'image/jpeg') {
  operation.check();
  const { viewport, width, height } = getPdfRenderViewport(page, scale);
  const canvas = document.createElement('canvas');
  let cropped;
  let renderTask;
  let timeout;
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: trimBlankMargins || Boolean(equationRegions) });
    if (!context) throw createPdfError('PDF canvas is unavailable', 'errorPdfRenderFailed');
    const renderOptions = selectRegion || equationRegions
      ? { ...(selectRegion ? { recordOperations: true } : {}), annotationMode: (await loadPdfJs()).AnnotationMode.DISABLE }
      : {};
    operation.check();
    renderTask = page.render({ canvasContext: context, viewport, intent: 'print', background: '#ffffff', ...renderOptions });
    operation.track(renderTask);
    const timeoutMs = pageNum === 1 ? CONFIG.PDF_FIRST_PAGE_RENDER_TIMEOUT_MS : CONFIG.PDF_RENDER_TIMEOUT_MS;
    const renderDeadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(createPdfError('PDF page render timed out', 'errorTimeout')), timeoutMs);
    });
    await Promise.race([renderTask.promise, renderDeadline]);
    clearTimeout(timeout);
    operation.check();
    if (equationRegions) {
      const output = [];
      for (const region of equationRegions) {
        const x = Math.max(0, Math.ceil(region.left * viewport.scale));
        const y = Math.max(0, Math.ceil(region.top * viewport.scale));
        const w = Math.min(width, Math.floor(region.right * viewport.scale)) - x;
        const h = Math.min(height, Math.floor(region.bottom * viewport.scale)) - y;
        if (w < 3 || h < 3 || !containsIsolatedInk(context, x, y, w, h)) {
          output.push(null);
          continue;
        }
        cropped = cropCanvas(canvas, x, y, w, h);
        output.push(await encodePdfCanvas(cropped, operation, 'image/png'));
        cropped.width = cropped.height = 0;
        cropped = undefined;
      }
      return { regions: output };
    }
    const region = selectRegion ? await selectRegion(viewport, width, height) : null;
    operation.check();
    if (selectRegion && !region) return null;
    if (trimBlankMargins || region) {
      const bounds = region
        ? { x: region.left, y: region.top, width: region.right - region.left, height: region.bottom - region.top }
        : findVisibleBounds(context, width, height);
      if (!bounds) return null;
      if (bounds.width !== width || bounds.height !== height) {
        cropped = cropCanvas(canvas, bounds.x, bounds.y, bounds.width, bounds.height);
        canvas.width = canvas.height = 0;
      }
    }
    return { ...await encodePdfCanvas(cropped || canvas, operation, mimeType), ...(region ? { region } : {}) };
  } catch (error) {
    try { renderTask?.cancel(); } catch {}
    throw error;
  } finally {
    clearTimeout(timeout);
    canvas.width = canvas.height = 0;
    if (cropped) cropped.width = cropped.height = 0;
  }
}
