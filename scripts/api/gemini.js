// @ts-check
// Gemini API module for ClipAIble extension

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { decryptApiKey } from '../utils/encryption.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Call Gemini API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Gemini API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGeminiAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  logDebug('callGeminiAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const modelName = model || 'gemini-3-pro-preview';
  
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
  
  let response;
  
  try {
    logDebug('Sending request to Gemini API...');
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
        
          // If not ok and retryable, throw error for retry logic
          if (!fetchResponse.ok) {
            const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
            if (retryableCodes.includes(fetchResponse.status)) {
              /** @type {Error & {status?: number, response?: Response}} */
              const error = new Error(`HTTP ${fetchResponse.status}`);
              error.status = fetchResponse.status;
              error.response = fetchResponse;
              throw error;
            }
            // Non-retryable error - throw immediately
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            /** @type {Error & {status?: number}} */
            const error = new Error(errorData.error?.message || `Gemini API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            throw error;
          }
          
          return fetchResponse;
        } catch (e) {
          throw e;
        } finally {
          // CRITICAL: Always clear timeout in finally to prevent memory leaks
          if (timeout) {
            clearTimeout(timeout);
          }
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`Gemini API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'gemini',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: false, // Keep existing localized message
        context: {
          operation: 'fetchRequest',
          model: modelName,
          errorName: 'AbortError'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorTimeout', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code; // Will be TIMEOUT
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    if (fetchError.status) {
      // Error from retry logic - already has status
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      
      // Normalize HTTP error with context (createUserMessage will handle status-specific messages)
      /** @type {import('../types.js').ExtendedError} */
      const httpError = new Error(`HTTP ${fetchError.status}`);
      httpError.status = fetchError.status;
      const normalized = await handleError(httpError, {
        source: 'gemini',
        errorType: 'httpError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message with status handling
        context: {
          operation: 'fetchRequest',
          model: modelName,
          statusCode: fetchError.status,
          errorData: errorData?.error
        }
      });
      
      // Use centralized user message with fallback
      const uiLang = await getUILanguageCached();
      let errorMessage = normalized.userMessage;
      if (!errorMessage) {
        // Fallback to manual messages if createUserMessage failed
        errorMessage = errorData?.error?.message || `Gemini API error: ${fetchError.status}`;
        if (fetchError.status === 401) {
          errorMessage = tSync('errorApiKeyInvalid', uiLang);
        } else if (fetchError.status === 403) {
          errorMessage = tSync('errorApiAccessForbidden', uiLang);
        } else if (fetchError.status === 429) {
          errorMessage = tSync('errorRateLimit', uiLang);
        }
      }
      
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(errorMessage);
      error.code = normalized.code; // Will be AUTH_ERROR, RATE_LIMIT, or PROVIDER_ERROR
      error.status = fetchError.status;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    // Network error (no status, not AbortError)
    const normalized = await handleError(fetchError, {
      source: 'gemini',
      errorType: 'networkError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'fetchRequest',
        model: modelName,
        errorName: fetchError.name
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNetwork', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code; // Will be NETWORK_ERROR
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }
  
  log('Gemini response', { status: response.status, ok: response.ok });

  const result = await response.json();
  
  // Gemini returns candidates array with content
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
  log('Gemini response received', { contentLength: textContent?.length });
  
  if (jsonResponse && textContent) {
    try {
      return JSON.parse(textContent);
    } catch (e) {
      // Try to extract JSON from markdown code block
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (extractError) {
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
 * @returns {Promise<string|null>} Translated image base64 or null
 */
export async function translateImageWithGemini(imageBase64, targetLang, googleApiKey) {
  log('translateImageWithGemini', { targetLang, imageLength: imageBase64?.length });
  
  // Decrypt API key before use
  let decryptedKey = googleApiKey;
  try {
    decryptedKey = await decryptApiKey(googleApiKey);
  } catch (error) {
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
      async () => {
        const fetchResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${decryptedKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
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
              }]
            })
          }
        );

        // If response is not ok and status is retryable, throw error
        if (!fetchResponse.ok) {
          const retryableCodes = [429, 500, 502, 503, 504];
          if (retryableCodes.includes(fetchResponse.status)) {
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          // Non-retryable error (e.g., 401, 403) - throw immediately
          let errorText = 'Unknown error';
          try {
            errorText = await fetchResponse.text();
          } catch (e) {
            // If text extraction fails, use default message
            errorText = 'Unknown error';
          }
          logWarn('Gemini API error', { status: fetchResponse.status, error: errorText });
          /** @type {Error & {status?: number}} */
          const error = new Error(`HTTP ${fetchResponse.status}`);
          error.status = fetchResponse.status;
          throw error;
        }
        
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
      if (part.inlineData?.data) {
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
export async function callGeminiAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  logDebug('callGeminiAPIWithImage', { model, imageSize: imageData.length });
  
  const modelName = model || 'gemini-3-pro-preview';
  
  // Extract base64 data (remove data:image/png;base64, prefix)
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  // Combine system and user prompts for Gemini
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  
  const requestBody = {
    contents: [
      {
        parts: [
          { text: combinedPrompt },
          {
            inline_data: {
              mime_type: 'image/png',
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
  
  let response;
  
  try {
    logDebug('Sending request to Gemini API with image...');
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
            if (retryableCodes.includes(fetchResponse.status)) {
              /** @type {Error & {status?: number, response?: Response}} */
              const error = new Error(`HTTP ${fetchResponse.status}`);
              error.status = fetchResponse.status;
              error.response = fetchResponse;
              clearTimeout(timeout);
              throw error;
            }
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            const uiLang = await getUILanguageCached();
            const errorMessage = errorData.error?.message || `API error: ${fetchResponse.status}`;
            clearTimeout(timeout);
            throw new Error(errorMessage);
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
          model: modelName || 'gemini-3-pro-preview',
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
        return JSON.parse(content);
      } catch (parseError) {
        // Normalize error with context for better logging and error tracking
        const normalized = await handleError(parseError, {
          source: 'gemini',
          errorType: 'jsonParseError',
          logError: true,
          createUserMessage: false, // Keep existing message format
          context: {
            operation: 'parseJsonResponse',
            model: modelName || 'gemini-3-pro-preview',
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
    
    return content;
  } catch (error) {
    logError('Gemini API call with image failed', error);
    throw error;
  }
}


