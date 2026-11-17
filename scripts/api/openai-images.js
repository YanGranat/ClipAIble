import { CONFIG } from '../utils/config.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { OPENAI_IMAGE_TRANSLATION_MODEL } from './image-translation-catalog.js';

function failure(status) {
  return Object.assign(new Error('OpenAI image translation failed'), {
    translationKey: 'errorImageTranslationFailed', translationParams: {}, retryable: false,
    ...(Number.isInteger(status) ? { status } : {})
  });
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !value || value.length % 4 || /[^A-Za-z0-9+/=]/.test(value)) throw failure();
  const binary = atob(value);
  if (btoa(binary) !== value) throw failure();
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validatePng(bytes, output = false) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || signature.some((value, index) => bytes[index] !== value)) throw failure();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw failure();
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 2147483647 || height > 2147483647) throw failure();
  // Bound exported rasters to the document canvas budget.
  if (output && (width > 32767 || height > 32767 || width * height > 2 ** 25)) throw failure();
  let hasData = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (length > bytes.length - offset - 12 || (offset !== 8 && type === 'IHDR')) throw failure();
    offset += length + 12;
    if (type === 'IDAT' && length > 0) hasData = true;
    if (type === 'IEND') {
      if (length || !hasData || offset !== bytes.length) throw failure();
      return;
    }
  }
  throw failure();
}

function validateInput(imageData) {
  if (typeof imageData !== 'string' || imageData.length > 20971520) throw failure();
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(imageData);
  if (!match) throw failure();
  const bytes = decodeBase64(match[2]);
  if (match[1] === 'png') validatePng(bytes);
  else if (match[1] === 'jpeg') {
    if (bytes.length < 6 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw failure();
  } else if (bytes.length < 20 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP' || new DataView(bytes.buffer).getUint32(4, true) + 8 !== bytes.length) throw failure();
}

/** Translate readable image text while retaining the source composition. */
export async function translateImageWithOpenAI(imageData, targetLang, apiKey, requestOptions = {}) {
  let cancellationError;
  let cancelled = false;
  let pollTimer;
  let settled = false;
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(requestOptions.signal.reason);
  const check = async () => {
    try {
      if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
      await requestOptions.checkCancelled?.();
      if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
    } catch (error) { cancelled = true; cancellationError = error; throw error; }
  };
  try {
    await check();
    validateInput(imageData);
    if (typeof apiKey !== 'string' || !apiKey.trim() || typeof targetLang !== 'string' || !targetLang.trim() || targetLang.length > 128) throw failure();
    const prompt = `Translate only the readable text in this image into ${JSON.stringify(targetLang.trim())}. ` +
      'Preserve the complete image, layout, aspect ratio, colors, fonts, charts, arrows, formulas, numbers, units, credits, and background. ' +
      'Use established technical terminology in the target language. Keep names, numeric values, symbols, and equations unchanged. ' +
      'Replace text in place without adding, removing, cropping, or rearranging visual elements. Preserve flat fills and textures without adding gradients or texture. Make no other changes.';
    requestOptions.signal?.addEventListener('abort', onParentAbort, { once: true });
    if (requestOptions.signal?.aborted) onParentAbort();
    const poll = async () => {
      try { await check(); }
      catch (error) { if (!settled) controller.abort(error); return; }
      if (!settled) pollTimer = setTimeout(poll, 100);
    };
    if (requestOptions.checkCancelled) pollTimer = setTimeout(poll, 100);
    const response = await fetchBufferedResponse('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_IMAGE_TRANSLATION_MODEL, prompt, images: [{ image_url: imageData }], n: 1,
        output_format: 'png', size: 'auto', quality: 'medium', complexity: 'medium'
      })
    }, CONFIG.API_TIMEOUT_MS, { checkCancelled: check });
    await check();
    if (!response.ok) throw failure(response.status);
    const result = await response.json();
    await check();
    if (!Array.isArray(result?.data) || result.data.length !== 1 ||
      (result.output_format !== undefined && result.output_format !== 'png')) throw failure();
    const base64 = result.data[0]?.b64_json;
    validatePng(decodeBase64(base64), true);
    await check();
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    if (cancelled && error === cancellationError) throw error;
    if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
    if (error?.translationKey === 'errorImageTranslationFailed') throw error;
    throw failure();
  } finally {
    settled = true;
    clearTimeout(pollTimer);
    requestOptions.signal?.removeEventListener('abort', onParentAbort);
  }
}
