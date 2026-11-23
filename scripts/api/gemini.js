import { createApiError, isApiBoundaryError } from './http-errors.js';
// @ts-check
// Gemini API module for ClipAIble extension

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { assertCompleteAIResponse } from './response-validation.js';
import { parseBase64Image } from './image-data.js';
import { callWithRetry } from '../utils/retry.js';
import { decryptApiKey } from '../utils/encryption.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';
import { GEMINI_IMAGE_MODEL, getDefaultModel, getModelMetadata } from '../utils/model-catalog.js';
import { isGeminiImageModel } from './image-translation-catalog.js';

export function getGeminiModelName(model) {
  const selectedModel = model || getDefaultModel('gemini');
  return getModelMetadata('gemini', selectedModel, { strict: true })?.apiModel || selectedModel;
}

/**
 * Preserve JSON/output settings while applying the model's supported reasoning configuration.
 * @param {string} model
 * @param {{thinkingConfig?: {thinkingBudget?: number, thinkingLevel?: string}, temperature?: number, topP?: number, topK?: number, [key: string]: unknown}} [generationConfig]
 */
export function getGeminiGenerationConfig(model, generationConfig = {}) {
  const metadata = getModelMetadata('gemini', model || getDefaultModel('gemini'), { strict: true });
  const config = { ...generationConfig };
  if (metadata?.reasoningEffort) {
    config.thinkingConfig = { ...config.thinkingConfig };
    if (metadata.reasoningEffort === 'none') {
      config.thinkingConfig.thinkingBudget = 0;
      delete config.thinkingConfig.thinkingLevel;
    } else {
      config.thinkingConfig.thinkingLevel = metadata.reasoningEffort;
      delete config.thinkingConfig.thinkingBudget;
    }
    delete config.temperature;
    delete config.topP;
    delete config.topK;
  }
  return config;
}

/** Concatenate answer parts and exclude optional thought summaries. */
export function getGeminiResponseText(response) {
  return (response?.candidates?.[0]?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
}

/**
 * Call Gemini API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGeminiAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true, requestOptions = {}) {
  logDebug('callGeminiAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const modelName = getGeminiModelName(model);
  
  // Combine system and user prompts for Gemini
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  
  const requestBody = {
    contents: [
      {
        parts: [
          { text: combinedPrompt }
        ]
      }
    ]
  };
  
  // Add generation config for JSON response
  if (jsonResponse) {
    requestBody.generationConfig = {
      responseMimeType: 'application/json'
    };
  }
  requestBody.generationConfig = getGeminiGenerationConfig(model, requestBody.generationConfig);
  
  let response;
  
  try {
    logDebug('Sending request to Gemini API...');
    
    // Use retry wrapper for fetch
    // Each retry has an independent request deadline.
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
        
        // If not ok and retryable, throw error for retry logic
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'gemini');

        return fetchResponse;

      },
      {
        onRetry: (attempt, delay) => {
          log(`Gemini API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }
  
  log('Gemini response', { status: response.status, ok: response.ok });

  const result = await response.json();
  await requestOptions.checkCancelled?.();
  assertCompleteAIResponse(result, 'gemini');
  
  // Gemini returns candidates array with content
  const textContent = getGeminiResponseText(result);
  if (!textContent) throw new Error('No content in API response');
  log('Gemini response received', { contentLength: textContent?.length });
  
  if (jsonResponse && textContent) {
    try {
      return JSON.parse(textContent);
    } catch (e) {
    if (isApiBoundaryError(e)) throw e;
      // Try to extract JSON from markdown code block
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (extractError) {
    if (isApiBoundaryError(extractError)) throw extractError;
          // Normalize error with context for better logging and error tracking
          const normalized = await handleError(extractError, {
            source: 'gemini',
            errorType: 'jsonParseError',
            logError: true,
            createUserMessage: false, // Keep existing localized message
            context: {
              operation: 'parseJsonResponse',
              model: modelName,
              contentLength: textContent.length,
              contentPreview: textContent.substring(0, 500),
              extractedFromMarkdown: true
            }
          });
          
          const uiLang = await getUILanguageCached();
          const userMessage = tSync('errorInvalidJsonResponse', uiLang);
          /** @type {import('../types.js').ExtendedError} */
          const error = new Error(userMessage);
          error.code = normalized.code;
          error.originalError = normalized.originalError;
          error.context = normalized.context;
          throw error;
        }
      }
      
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(e, {
        source: 'gemini',
        errorType: 'invalidJsonError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'parseJsonResponse',
          model: modelName,
          contentLength: textContent.length,
          contentPreview: textContent.substring(0, 500),
          extractedFromMarkdown: false
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorInvalidJsonResponse', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
  }
  
  return textContent;
}

/**
 * Translate image using Gemini's image generation capability
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} targetLang - Target language name
 * @param {string} googleApiKey - Google API key
 * @param {import('../types.js').ImageTranslationOptions} [requestOptions]
 * @returns {Promise<string|null>} Translated image base64 or null
 */
export async function translateImageWithGemini(imageBase64, targetLang, googleApiKey, requestOptions = {}) {
  const { geminiImageModel = GEMINI_IMAGE_MODEL } = requestOptions;
  if (!isGeminiImageModel(geminiImageModel)) {
    throw Object.assign(new Error('Unsupported Google image translation model'), {
      translationKey: 'errorImageModelUnsupported', translationParams: {}
    });
  }
  log('translateImageWithGemini', { targetLang, model: geminiImageModel, imageLength: imageBase64?.length });
  
  // Decrypt API key before use
  let decryptedKey = googleApiKey;
  try {
    decryptedKey = await decryptApiKey(googleApiKey);
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    log('Failed to decrypt Google API key, using as-is (may be plain text)', error);
  }
  
  // Extract base64 data and mime type from data URL
  const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    logWarn('Invalid image data URL format');
    return null;
  }
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  
  const prompt = `Translate ALL text visible in this image to ${targetLang}.
Keep the exact same visual style, fonts, colors, and layout.
Only change the text content - do not modify anything else in the image.
Translate text from ANY language to ${targetLang}.
If there are diagrams, charts, infographics, or labels - translate those too.`;

  try {
    // Wrap fetch with retry mechanism for reliability (429/5xx errors)
    const response = await callWithRetry(
      async ({ signal }) => {
        const fetchResponse = await fetchBufferedResponse(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModel}:generateContent`,
          { signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': decryptedKey
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data
                    }
                  },
                  {
                    text: prompt
                  }
                ]
              }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
            })
          }, CONFIG.API_TIMEOUT_MS, requestOptions
        );

        // If response is not ok and status is retryable, throw error
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'gemini');
        
        return fetchResponse;
      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );

    // If we get here, retry succeeded or non-retryable error was thrown
    // For non-retryable errors (401, 403, etc.), retry throws immediately, so we won't reach here
    // For retryable errors that failed after all retries, retry throws, so we won't reach here
    // So if we get here, response should be ok
    const data = await response.json();
    await requestOptions.checkCancelled?.();
    assertCompleteAIResponse(data, 'gemini');
    
    // Log full response structure for debugging when image generation fails
    const hasCandidates = !!data.candidates;
    const candidatesLength = data.candidates?.length || 0;
    const firstCandidate = data.candidates?.[0];
    const hasContent = !!firstCandidate?.content;
    const hasParts = !!firstCandidate?.content?.parts;
    const partsLength = firstCandidate?.content?.parts?.length || 0;
    
    // Extract the generated image from response
    const parts = firstCandidate?.content?.parts;
    if (!parts || parts.length === 0) {
      logWarn('No parts in Gemini response', {
        hasCandidates,
        candidatesLength,
        hasContent,
        hasParts,
        partsLength,
        responseKeys: Object.keys(data),
        firstCandidateKeys: firstCandidate ? Object.keys(firstCandidate) : null,
        contentKeys: firstCandidate?.content ? Object.keys(firstCandidate.content) : null,
        note: 'Gemini API returned success but no image data. This may indicate the model could not generate the translated image.'
      });
      return null;
    }
    
    // Find the image part in response
    for (const part of parts) {
      if (!part.thought && part.inlineData?.data) {
        const resultMimeType = part.inlineData.mimeType || 'image/png';
        const resultBase64 = `data:${resultMimeType};base64,${part.inlineData.data}`;
        log('translateImageWithGemini success', { resultLength: resultBase64.length });
        return resultBase64;
      }
    }
    
    // Parts exist but no image data found
    logWarn('No image data in Gemini response', {
      hasParts: !!parts,
      partsLength: parts?.length || 0,
      hasCandidates,
      candidatesLength,
      partTypes: parts?.map(p => Object.keys(p)).join(', ') || 'none',
      note: 'Gemini returned parts but none contain inlineData. Response may contain text instead of image.'
    });
    return null;
  } catch (error) {
    await requestOptions.checkCancelled?.();
    logError('translateImageWithGemini failed', {
      error: error.message,
      status: error.status,
      statusCode: error.statusCode,
      hasResponse: !!error.response,
      responseStatus: error.response?.status
    });
    return null;
  }
}

/**
 * Call Gemini API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGeminiAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true, requestOptions = {}, messageHistory = []) {
  const response = await requestGeminiImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse, requestOptions, messageHistory);
  return response.result;
}

/**
 * Preserve the exact sent and received parts for signed multi-turn histories.
 * @returns {Promise<{result: Object|string, assistantMessage: Array<Object>, userMessage: Object}>}
 */
export function callGeminiAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true, requestOptions = {}) {
  return requestGeminiImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse, requestOptions, messageHistory);
}

async function requestGeminiImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse, requestOptions, messageHistory) {
  logDebug('callGeminiAPIWithImage', { model, imageSize: imageData.length });
  
  const modelName = getGeminiModelName(model);
  
  // Extract base64 data (remove data:image/png;base64, prefix)
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  // Combine system and user prompts for Gemini
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  
  const requestBody = {
    contents: [
      ...messageHistory.map(message => {
        const parts = message.parts || (Array.isArray(message.content) ? message.content : [{ text: message.content }]);
        return {
          role: ['assistant', 'model'].includes(message.role) ? 'model' : 'user',
          parts: parts.map(part => {
            if (!part.type && part.thoughtSignature) return { ...part };
            if (typeof part.text === 'string') {
              return part.type ? { text: part.text } : { ...part };
            }
            if (part.inline_data) return { inline_data: { ...part.inline_data } };
            if (part.inlineData) return { ...part };
            if (part.image_url?.url) {
              const image = parseBase64Image(part.image_url.url);
              return { inline_data: { mime_type: image.mimeType, data: image.base64Image } };
            }
            if (part.source?.type === 'base64') return { inline_data: { mime_type: part.source.media_type, data: part.source.data } };
            throw new Error('Unsupported Gemini history content.');
          })
        };
      }),
      {
        role: 'user',
        parts: [
          { text: combinedPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ]
  };
  
  // Add generation config for JSON response
  if (jsonResponse) {
    requestBody.generationConfig = {
      responseMimeType: 'application/json'
    };
  }
  requestBody.generationConfig = getGeminiGenerationConfig(model, requestBody.generationConfig);
  
  let response;
  
  try {
    logDebug('Sending request to Gemini API with image...');
    
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
          
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'gemini');

        return fetchResponse;

      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    await requestOptions.checkCancelled?.();
    assertCompleteAIResponse(data, 'gemini');
    const content = getGeminiResponseText(data);
    if (!content) {
      // Normalize error with context for better logging and error tracking
      const noContentError = new Error('No content in API response');
      const normalized = await handleError(noContentError, {
        source: 'gemini',
        errorType: 'noContentError',
        logError: true,
        createUserMessage: false, // Keep existing message format
        context: {
          operation: 'validateContent',
          model: modelName,
          hasData: !!data,
          hasCandidates: !!data?.candidates,
          candidatesCount: data?.candidates?.length || 0
        }
      });
      
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error('No content in API response');
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    if (jsonResponse) {
      try {
        return {
          result: JSON.parse(content),
          assistantMessage: data.candidates[0].content.parts,
          userMessage: { role: 'user', content: requestBody.contents[requestBody.contents.length - 1].parts }
        };
      } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
        // Normalize error with context for better logging and error tracking
        const normalized = await handleError(parseError, {
          source: 'gemini',
          errorType: 'jsonParseError',
          logError: true,
          createUserMessage: false, // Keep existing message format
          context: {
            operation: 'parseJsonResponse',
            model: modelName,
            contentLength: content.length,
            contentPreview: content.substring(0, 500)
          }
        });
        
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(`Invalid JSON response from Gemini: ${parseError.message}`);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
    }
    
    return {
      result: content,
      assistantMessage: data.candidates[0].content.parts,
      userMessage: { role: 'user', content: requestBody.contents[requestBody.contents.length - 1].parts }
    };
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    await requestOptions.checkCancelled?.();
    logError('Gemini API call with image failed', error);
    throw error;
  }
}

