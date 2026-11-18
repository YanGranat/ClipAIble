// @ts-check
// User-friendly error message generator with actionable advice
// Provides localized, helpful error messages instead of technical ones

import { getUILanguage, tSync } from '../locales.js';

const ERROR_KEYS = {
    'selectorAnalysisFailed': 'errorSelectorAnalysisFailed',
    'contentExtractionFailed': 'errorContentExtractionFailed',
    'noContentExtracted': 'errorNoContentExtracted',
    'scriptExecutionFailed': 'errorScriptExecutionFailed',
    'emptySelectors': 'errorEmptySelectors',
    'extractModeNoContent': 'errorExtractModeNoContent',
    'videoProcessingFailed': 'errorVideoProcessingFailed',
    'subtitleProcessingFailed': 'errorSubtitleProcessingFailed',
    'imageTranslationFailed': 'errorImageTranslationFailed',
    'abstractGenerationFailed': 'errorAbstractGenerationFailed',
    'pdfGenerationFailed': 'errorPdfGenerationFailed',
    'epubGenerationFailed': 'errorEpubGenerationFailed',
    'fb2GenerationFailed': 'errorFb2GenerationFailed',
    'markdownGenerationFailed': 'errorMarkdownGenerationFailed',
    'audioGenerationFailed': 'errorAudioGenerationFailed',
    'tabNotFound': 'errorTabNotFound',
    'noApiKey': 'errorNoApiKey',
    'invalidFormat': 'errorInvalidFormat',
    'pageNotReady': 'errorPageNotReady',
    // Generation errors
    'noContentError': 'errorPdfNoContent', // Used for PDF generation
    'noContentToGenerateEpub': 'errorNoContentToGenerateEpub',
    'noContentToGenerateMarkdown': 'errorNoContentToGenerateMarkdown',
    'noContentToGenerateFb2': 'errorNoContentToGenerateFb2',
    'preparationError': 'errorFailedToPrepareContent',
    'emptyResultError': 'errorAudioEmptyResult',
    'noTextError': 'errorNoContentExtracted', // Fallback for audio-prep
    'splitError': 'errorContentExtractionFailed', // Fallback for audio-prep
    'stylesLoadError': 'errorPdfGenerationFailed', // Fallback for PDF styles
    'storageError': 'errorPdfGenerationFailed', // Fallback for PDF storage
    'tabCreationError': 'errorTabNotFound', // Fallback for PDF tab creation
    // Translation errors
    'translateTextFailed': 'errorContentExtractionFailed', // Fallback
    'translateBatchFailed': 'errorContentExtractionFailed', // Fallback
    'translateChunkFailed': 'errorContentExtractionFailed', // Fallback
    'detectImageTextFailed': 'errorImageTranslationFailed',
    'processImageFailed': 'errorImageTranslationFailed',
    'detectContentLanguageFailed': 'errorContentExtractionFailed', // Fallback
    // Summary/Generation errors
    'noContentForSummary': 'errorNoContentForSummary',
    'noApiKeyForSummary': 'errorApiKeyRequiredForSummary',
    'noTextExtractedForSummary': 'errorNoTextExtractedForSummary',
    // API errors (generic)
    'httpError': 'errorApiError', // Generic HTTP error, will be replaced with specific message based on status
    'networkError': 'errorNetwork',
    'timeoutError': 'errorTimeout',
    'parseError': 'errorFailedToParseResponse',
    'invalidJsonError': 'errorInvalidJsonResponse',
    'apiNoContentError': 'errorNoContentReceived' // API returned no content
};
  

/** Return a message identity without fixing it to the current UI language. */
export function getUserFriendlyErrorDescriptor(errorType, context = {}) {
  const error = context.error;
  if (typeof error?.translationKey === 'string' && error.translationKey) {
    return { key: error.translationKey, params: error.translationParams || {} };
  }
  const status = Number(error?.status || error?.statusCode || error?.response?.status);
  if (status === 401) return { key: 'errorApiKeyInvalid', params: {} };
  if (status === 403) return { key: 'errorApiAccessForbidden', params: {} };
  if (error?.code === 'auth_error') return { key: 'errorApiKeyInvalid', params: {} };
  if (status === 429 || error?.code === 'rate_limit') return { key: 'errorRateLimit', params: {} };
  if (error?.name === 'TimeoutError' || error?.code === 'timeout') return { key: 'errorTimeout', params: {} };
  if (error?.code === 'network_error' || error instanceof TypeError) return { key: 'errorNetwork', params: {} };
  if (errorType === 'pageNotReady' && context.blockedPage) return { key: 'pageNotAccessible', params: {} };
  if (errorType === 'httpError' && context.statusCode) {
    const status = Number(context.statusCode);
    if (status === 401) return { key: 'errorApiKeyInvalid', params: {} };
    if (status === 403) return { key: 'errorApiAccessForbidden', params: {} };
    if (status === 429) return { key: 'errorRateLimit', params: {} };
    if (status === 404 && context.model) return { key: 'errorModelNotFound', params: { model: context.model } };
    return { key: 'errorApiError', params: { status } };
  }
  const key = Object.hasOwn(ERROR_KEYS, errorType) ? ERROR_KEYS[errorType] : null;
  if (!key) return error?.message ? null : { key: 'errorUnknown', params: {} };
  return { key, params: tSync(key, 'en').includes('{error}') ? { error: error?.message || '' } : {} };
}

/** Generate a message in the current UI language, retaining upstream diagnostics when unmapped. */
export async function getUserFriendlyError(errorType, context = {}) {
  const descriptor = getUserFriendlyErrorDescriptor(errorType, context);
  if (!descriptor) return context.error.message;
  return tSync(descriptor.key, await getUILanguage(), descriptor.params);
}

/**
 * Create error object with user-friendly message and error code
 * @param {string} errorType - Type of error
 * @param {Record<string, any>} [context={}] - Additional context
 * @param {string} [errorCode] - Error code (from ERROR_CODES)
 * @returns {Promise<{message: string, code: string}>} Error object with message and code
 * @see {@link getUserFriendlyError} For generating error messages only
 * @see {@link handleError} For complete error handling that uses this function
 */
export async function createUserFriendlyError(errorType, context = {}, errorCode = null) {
  const message = await getUserFriendlyError(errorType, context);
  const descriptor = getUserFriendlyErrorDescriptor(errorType, context);
  
  // Map error types to error codes if not provided
  if (!errorCode) {
    const codeMap = {
      'selectorAnalysisFailed': 'provider_error',
      'contentExtractionFailed': 'provider_error',
      'noContentExtracted': 'validation_error',
      'scriptExecutionFailed': 'network_error',
      'emptySelectors': 'provider_error',
      'extractModeNoContent': 'validation_error',
      'videoProcessingFailed': 'provider_error',
      'subtitleProcessingFailed': 'provider_error',
      'imageTranslationFailed': 'auth_error',
      'abstractGenerationFailed': 'provider_error',
      'pdfGenerationFailed': 'provider_error',
      'epubGenerationFailed': 'provider_error',
      'fb2GenerationFailed': 'provider_error',
      'markdownGenerationFailed': 'provider_error',
      'audioGenerationFailed': 'auth_error',
      'tabNotFound': 'validation_error',
      'noApiKey': 'auth_error',
      'invalidFormat': 'validation_error',
      'pageNotReady': 'validation_error',
      // Generation errors
      'noContentError': 'validation_error',
      'noContentToGenerateEpub': 'validation_error',
      'noContentToGenerateMarkdown': 'validation_error',
      'noContentToGenerateFb2': 'validation_error',
      'preparationError': 'provider_error',
      'emptyResultError': 'provider_error',
      'noTextError': 'validation_error',
      'splitError': 'provider_error',
      'stylesLoadError': 'network_error',
      'storageError': 'provider_error',
      'tabCreationError': 'validation_error',
      // Translation errors
      'translateTextFailed': 'provider_error',
      'translateBatchFailed': 'provider_error',
      'translateChunkFailed': 'provider_error',
      'detectImageTextFailed': 'provider_error',
      'processImageFailed': 'provider_error',
      'detectContentLanguageFailed': 'provider_error',
      // Summary/Generation errors
      'noContentForSummary': 'validation_error',
      'noApiKeyForSummary': 'auth_error',
      'noTextExtractedForSummary': 'validation_error',
      // API errors (generic)
      'httpError': 'provider_error', // Will be overridden by status code
      'networkError': 'network_error',
      'timeoutError': 'timeout',
      'parseError': 'parse_error',
      'invalidJsonError': 'parse_error',
      'apiNoContentError': 'validation_error' // API returned no content
    };
    
    errorCode = codeMap[errorType] || 'unknown_error';
  }
  
  return {
    message,
    code: errorCode,
    ...(descriptor ? { translationKey: descriptor.key, translationParams: descriptor.params } : {})
  };
}






