// @ts-check
import { getRasterJob, setRasterResult, pruneExpiredRasterJobs } from '../api/image-raster-storage.js';
import { MAX_IMAGE_BYTES, imageDataError } from '../utils/html/image-bytes.js';
import { CONFIG } from '../utils/config.js';

const active = new Map();
let pending = Promise.resolve();

/** Decode in the SVG image context, where scripting and external resources are disabled. */
export async function rasterizeImage(blob, signal) {
  if (signal?.aborted) throw imageDataError('IMAGE_CANCELLED');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let canvas, abort;
  try {
    await new Promise((resolve, reject) => {
      abort = () => reject(imageDataError('IMAGE_CANCELLED'));
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = resolve;
      image.onerror = () => reject(imageDataError('IMAGE_DECODE_FAILED'));
      image.src = url;
    });
    if (signal?.aborted) throw imageDataError('IMAGE_CANCELLED');
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw imageDataError('IMAGE_DECODE_FAILED');
    if (!['image/svg+xml', 'image/webp', 'image/avif'].includes(blob.type)) return blob;
    const scale = Math.min(1, 32767 / width, 32767 / height, Math.sqrt(2 ** 25 / (width * height)));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw imageDataError('IMAGE_DECODE_FAILED');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (signal?.aborted) throw imageDataError('IMAGE_CANCELLED');
    if (!output?.size || output.size > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
    return output;
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    image.onload = image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export function handleImageRasterMessage(message) {
  const { id, processingRunId = null } = message.data || {};
  if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) return Promise.resolve({ success: false, code: 'IMAGE_INVALID_OPERATION' });
  if (message.type === 'CANCEL_IMAGE_RASTER') {
    const operation = active.get(id);
    if (operation?.processingRunId === processingRunId) operation.controller.abort();
    return Promise.resolve({ success: true });
  }
  if (active.has(id)) return Promise.resolve({ success: false, code: 'IMAGE_BUSY' });
  const controller = new AbortController();
  const operation = { controller, processingRunId };
  active.set(id, operation);
  let timer = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
  const execute = async () => {
    try {
      await pruneExpiredRasterJobs();
      const job = await getRasterJob(id);
      if (controller.signal.aborted || job?.processingRunId !== processingRunId || !(job?.input instanceof Blob)) throw imageDataError('IMAGE_CANCELLED');
      if (!(job.expiresAt > Date.now())) throw imageDataError('IMAGE_TIMEOUT');
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), job.expiresAt - Date.now());
      if (!job.input.size || job.input.size > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
      const result = await rasterizeImage(job.input, controller.signal);
      if (controller.signal.aborted || !await setRasterResult(id, processingRunId, result)) throw imageDataError('IMAGE_CANCELLED');
      return { success: true };
    } catch (error) { return { success: false, code: error.code || 'IMAGE_DECODE_FAILED' }; }
    finally { clearTimeout(timer); if (active.get(id) === operation) active.delete(id); }
  };
  const result = pending.then(execute, execute);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
