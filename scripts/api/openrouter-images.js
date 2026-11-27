// @ts-check
import { CONFIG } from '../utils/config.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { createImageTranslationPrompt, readRasterBase64, readRasterDataUrl } from './image-data.js';
import { DEFAULT_OPENROUTER_IMAGE_MODEL, isOpenRouterImageModel } from './image-translation-catalog.js';

function failure(status) {
  return Object.assign(new Error('OpenRouter image translation failed'), {
    translationKey: 'errorImageTranslationFailed', translationParams: {}, retryable: false,
    ...(Number.isInteger(status) ? { status } : {})
  });
}

/**
 * Edit one source image using the OpenRouter Images API shared by the supported editors.
 * @param {string} imageData
 * @param {string} targetLang
 * @param {string} apiKey
 * @param {import('../types.js').ImageTranslationOptions} [requestOptions]
 */
export async function translateImageWithOpenRouter(imageData, targetLang, apiKey, requestOptions = {}) {
  let cancelled = false, cancellationError;
  const check = async () => {
    try {
      requestOptions.signal?.throwIfAborted();
      await requestOptions.checkCancelled?.();
      requestOptions.signal?.throwIfAborted();
    } catch (error) {
      cancelled = true;
      cancellationError = error;
      throw error;
    }
  };
  try {
    await check();
    const { openrouterImageModel = DEFAULT_OPENROUTER_IMAGE_MODEL } = requestOptions;
    if (!isOpenRouterImageModel(openrouterImageModel) || typeof apiKey !== 'string' || !apiKey.trim() ||
        typeof targetLang !== 'string' || !targetLang.trim() || targetLang.length > 128) throw failure();
    const source = readRasterDataUrl(imageData).dataUrl;
    const editingOptions = openrouterImageModel.startsWith('openai/')
      ? { output_format: 'png', aspect_ratio: 'auto', quality: 'medium' } : {};
    const response = await fetchBufferedResponse('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/YanGranat/ClipAIble',
        'X-Title': 'ClipAIble'
      },
      body: JSON.stringify({
        model: openrouterImageModel,
        prompt: createImageTranslationPrompt(targetLang, requestOptions),
        input_references: [{ type: 'image_url', image_url: { url: source } }],
        n: 1, response_format: 'b64_json', ...editingOptions
      })
    }, CONFIG.API_TIMEOUT_MS, { ...requestOptions, checkCancelled: check });
    await check();
    if (!response.ok) throw failure(response.status);
    const result = await response.json();
    await check();
    if (result?.error || !Array.isArray(result?.data) || result.data.length !== 1 || result.data[0]?.error) throw failure();
    const { format, bytes, dataUrl } = readRasterBase64(result.data[0]?.b64_json, { exported: true, limitLength: true });
    if (result.output_format !== undefined && result.output_format !== format) throw failure();
    if (editingOptions.output_format && editingOptions.output_format !== format) throw failure();
    await check();
    if (dataUrl === source) return null;
    const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${format}` }));
    bitmap.close();
    await check();
    return dataUrl;
  } catch (error) {
    if (cancelled && error === cancellationError) throw error;
    if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
    if (error?.translationKey === 'errorImageTranslationFailed') throw error;
    throw failure();
  }
}
