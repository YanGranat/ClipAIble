// @ts-check
import { GEMINI_IMAGE_MODEL } from '../utils/model-catalog.js';

export const IMAGE_TRANSLATION_PROVIDERS = Object.freeze(['gemini', 'openai']);
export const DEFAULT_IMAGE_TRANSLATION_PROVIDER = 'gemini';
export const OPENAI_IMAGE_TRANSLATION_MODEL = 'gpt-image-2.6-sunburst';
export const OPENAI_IMAGE_DETECTION_MODEL = 'gpt-6-luna-none';
export const IMAGE_TRANSLATION_FORMATS = Object.freeze(['pdf', 'epub', 'fb2']);

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
