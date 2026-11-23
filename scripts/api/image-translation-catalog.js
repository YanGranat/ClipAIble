// @ts-check
import { GEMINI_IMAGE_MODEL } from '../utils/model-catalog.js';

export const IMAGE_TRANSLATION_PROVIDERS = Object.freeze(['gemini', 'openai']);
export const DEFAULT_IMAGE_TRANSLATION_PROVIDER = 'gemini';
export const GEMINI_IMAGE_MODELS = Object.freeze({
  'gemini-nano-banana-2.1': 'Gemini Nano Banana 2.1',
  'gemini-3.1-flash-lite-image': 'Gemini 3.1 Flash Lite Image',
  [GEMINI_IMAGE_MODEL]: 'Gemini 3 Pro Image'
});
export const OPENAI_IMAGE_TRANSLATION_MODEL = 'gpt-image-2.6-sunburst';
export const OPENAI_IMAGE_DETECTION_MODEL = 'gpt-6-luna-none';
export const IMAGE_TRANSLATION_FORMATS = Object.freeze(['pdf', 'epub', 'fb2']);

/**
 * @param {unknown} model
 * @returns {model is string}
 */
export function isGeminiImageModel(model) {
  return typeof model === 'string' && Object.hasOwn(GEMINI_IMAGE_MODELS, model);
}

/** @param {unknown} [model] */
export function readGeminiImageModel(model) {
  return isGeminiImageModel(model) ? model : GEMINI_IMAGE_MODEL;
}

export function getImageTranslationModel(provider = DEFAULT_IMAGE_TRANSLATION_PROVIDER) {
  if (provider === 'gemini') return GEMINI_IMAGE_MODEL;
  if (provider === 'openai') return OPENAI_IMAGE_TRANSLATION_MODEL;
  return null;
}

export function supportsImageTranslation(format) {
  return IMAGE_TRANSLATION_FORMATS.includes(format);
}

export function isImageTranslationEnabled(data) {
  return Boolean(data.translateImages) && (data.language || 'auto') !== 'auto' &&
    supportsImageTranslation(data.outputFormat || 'pdf');
}

export function getImageTranslationApiKey(data) {
  return data.imageTranslationProvider === 'openai' ? data.imageApiKey : (data.imageApiKey ?? data.googleApiKey);
}
