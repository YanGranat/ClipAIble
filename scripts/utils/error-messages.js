// User-friendly error message generator with actionable advice
// Provides localized, helpful error messages instead of technical ones

import { getUILanguage, tSync } from '../locales.js';
import { logError } from './logging.js';

/**
 * Generate user-friendly error message with actionable advice
 * @param {string} errorType - Type of error (e.g., 'selectorAnalysisFailed', 'contentExtractionFailed')
 * @param {Object} context - Additional context (error object, details, etc.)
 * @returns {Promise<string>} User-friendly error message
 */
export async function getUserFriendlyError(errorType, context = {}) {
  const uiLang = await getUILanguage();
  
  // Map error types to localization keys
  const errorKeyMap = {
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
    'pageNotReady': 'errorPageNotReady'
  };
  
  const errorKey = errorKeyMap[errorType];
  
  if (errorKey) {
    try {
      const message = tSync(errorKey, uiLang);
      // Replace placeholders if any
      if (context.error && context.error.message && message.includes('{error}')) {
        return message.replace('{error}', context.error.message);
      }
      return message;
    } catch (error) {
      logError('Failed to get localized error message', { errorType, errorKey, error });
      // Fallback to English
      return tSync(errorKey, 'en') || getFallbackMessage(errorType);
    }
  }
  
  // If no mapping found, try to extract useful info from error
  if (context.error && context.error.message) {
    return context.error.message;
  }
  
  return getFallbackMessage(errorType);
}

/**
 * Get fallback error message in English
 * @param {string} errorType - Type of error
 * @returns {string} Fallback message
 */
function getFallbackMessage(errorType) {
  const fallbacks = {
    'selectorAnalysisFailed': 'Failed to analyze page structure. Try switching to "AI Extract" mode in settings, or check your API key.',
    'contentExtractionFailed': 'Failed to extract content from page. Try: 1) Switch to "AI Extract" mode, 2) Scroll to load all content, 3) Check if page uses dynamic loading.',
    'noContentExtracted': 'No content found on this page. Try: 1) Switch to "AI Extract" mode, 2) Make sure the page has loaded completely, 3) Try a different article.',
    'scriptExecutionFailed': 'Failed to read page content. The page may be blocking extensions. Try refreshing the page and try again.',
    'emptySelectors': 'AI could not find content selectors. Try switching to "AI Extract" mode in settings.',
    'extractModeNoContent': 'AI Extract mode returned no content. The page may use dynamic loading. Try scrolling to load all content before saving.',
    'videoProcessingFailed': 'Failed to process video. Make sure subtitles are enabled, or try enabling "Transcribe audio if no subtitles" in settings.',
    'subtitleProcessingFailed': 'Failed to process subtitles. Try again or check your API key.',
    'imageTranslationFailed': 'Failed to translate images. Check your Google API key in settings (required for image translation).',
    'abstractGenerationFailed': 'Failed to generate summary. Check your API key and try again.',
    'pdfGenerationFailed': 'Failed to generate PDF. Try: 1) Check your API key, 2) Try a different format, 3) Make sure the page has loaded completely.',
    'epubGenerationFailed': 'Failed to generate EPUB. Try again or check your settings.',
    'fb2GenerationFailed': 'Failed to generate FB2. Try again or check your settings.',
    'markdownGenerationFailed': 'Failed to generate Markdown. Try again or check your settings.',
    'audioGenerationFailed': 'Failed to generate audio. Check your TTS provider API key and try again.',
    'tabNotFound': 'Page tab not found. Please refresh the page and try again.',
    'noApiKey': 'API key is required. Please add your API key in settings.',
    'invalidFormat': 'Invalid export format selected. Please choose a valid format.',
    'pageNotReady': 'Page is not ready. Please wait for the page to load completely and try again.'
  };
  
  return fallbacks[errorType] || 'An error occurred. Please try again.';
}

/**
 * Create error object with user-friendly message and error code
 * @param {string} errorType - Type of error
 * @param {Object} context - Additional context
 * @param {string} errorCode - Error code (from ERROR_CODES)
 * @returns {Promise<Object>} Error object with {message, code}
 */
export async function createUserFriendlyError(errorType, context = {}, errorCode = null) {
  const message = await getUserFriendlyError(errorType, context);
  
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
      'pageNotReady': 'validation_error'
    };
    
    errorCode = codeMap[errorType] || 'unknown_error';
  }
  
  return {
    message,
    code: errorCode
  };
}


