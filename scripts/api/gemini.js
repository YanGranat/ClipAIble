// @ts-check
// Gemini API module for ClipAIble extension

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { decryptApiKey } from '../utils/encryption.js';

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
  log('callGeminiAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
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
    log('Sending request to Gemini API...');
    
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
              clearTimeout(timeout);
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
            clearTimeout(timeout);
            throw error;
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearTimeout(timeout);
          throw e;
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
      logError('Gemini API request timed out');
      throw new Error('Request timed out. Please try again.');
    }
    if (fetchError.status) {
      // Error from retry logic - already has status
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      throw new Error(errorData?.error?.message || `Gemini API error: ${fetchError.status}`);
    }
    logError('Network error calling Gemini', fetchError);
    throw new Error(`Network error: ${fetchError.message}`);
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
        return JSON.parse(jsonMatch[1].trim());
      }
      logError('Failed to parse Gemini JSON response', e);
      throw new Error('Invalid JSON response from Gemini');
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
    
    // Extract the generated image from response
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) {
      logWarn('No parts in Gemini response');
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
    
    logWarn('No image data in Gemini response');
    return null;
  } catch (error) {
    logError('translateImageWithGemini failed', error);
    return null;
  }
}


