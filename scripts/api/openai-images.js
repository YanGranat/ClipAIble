import { CONFIG } from '../utils/config.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { OPENAI_IMAGE_TRANSLATION_MODEL } from './image-translation-catalog.js';
import { assertRasterDecodes, createImageTranslationPrompt, readRasterBase64, readRasterDataUrl } from './image-data.js';

function failure(status) {
  return Object.assign(new Error('OpenAI image translation failed'), {
    translationKey: 'errorImageTranslationFailed', translationParams: {}, retryable: false,
    ...(Number.isInteger(status) ? { status } : {})
  });
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
    readRasterDataUrl(imageData);
    if (typeof apiKey !== 'string' || !apiKey.trim() || typeof targetLang !== 'string' || !targetLang.trim() || targetLang.length > 128) throw failure();
    const prompt = createImageTranslationPrompt(targetLang, requestOptions);
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
    }, CONFIG.API_TIMEOUT_MS, { checkCancelled: check, onRequestStart: requestOptions.onRequestStart });
    await check();
    if (!response.ok) throw failure(response.status);
    const result = await response.json();
    await check();
    if (!Array.isArray(result?.data) || result.data.length !== 1 ||
      (result.output_format !== undefined && result.output_format !== 'png')) throw failure();
    const raster = readRasterBase64(result.data[0]?.b64_json, { format: 'png', exported: true });
    await assertRasterDecodes(raster);
    await check();
    return raster.dataUrl;
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
