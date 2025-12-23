// @ts-check
// OpenRouter API module for ClipAIble extension

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';

/**
 * Call OpenRouter API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - Model name (format: provider/model-name)
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callOpenRouterAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  log('callOpenRouterAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const modelName = model || 'openai/gpt-4o';
  const requestBody = {
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  
  try {
    log('Sending request to OpenRouter API...');
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://github.com/clipaiable', // Optional: for app attribution
              'X-Title': 'ClipAIble' // Optional: for app attribution
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
            
            // Provide more helpful error messages for common errors
            const uiLang = await getUILanguageCached();
            let errorMessage = errorData.error?.message || tSync('errorApiError', uiLang).replace('{status}', fetchResponse.status);
            if (fetchResponse.status === 401) {
              errorMessage = tSync('errorApiKeyInvalid', uiLang);
            } else if (fetchResponse.status === 403) {
              errorMessage = tSync('errorApiAccessForbidden', uiLang);
            } else if (fetchResponse.status === 429) {
              errorMessage = tSync('errorRateLimit', uiLang);
            }
            
            /** @type {Error & {status?: number}} */
            const error = new Error(errorMessage);
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
          log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      logError('OpenRouter API request timed out');
      const uiLang = await getUILanguageCached();
      throw new Error(tSync('errorTimeout', uiLang));
    }
    if (fetchError.status) {
      // Error from retry logic - already has status
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      
      // Provide more helpful error messages for common errors
      const uiLang = await getUILanguageCached();
      let errorMessage = errorData?.error?.message || tSync('errorApiError', uiLang).replace('{status}', fetchError.status);
      if (fetchError.status === 401) {
        errorMessage = tSync('errorApiKeyInvalid', uiLang);
      } else if (fetchError.status === 403) {
        errorMessage = tSync('errorApiAccessForbidden', uiLang);
      } else if (fetchError.status === 429) {
        errorMessage = tSync('errorRateLimit', uiLang);
      }
      
      throw new Error(errorMessage);
    }
    logError('Network error calling OpenRouter', fetchError);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorNetwork', uiLang));
  }

  log('OpenRouter response', { status: response.status, ok: response.ok });

  let result;
  try {
    result = await response.json();
    log('OpenRouter response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage 
    });
  } catch (parseError) {
    logError('Failed to parse response', parseError);
    throw new Error('Failed to parse AI response');
  }

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    logError('No content in response', result);
    throw new Error('No content received from AI');
  }

  log('Response content', { length: content.length, preview: content.substring(0, 100) });

  if (!jsonResponse) {
    return content;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (jsonError) {
    logError('JSON parse error', { error: jsonError, content: content.substring(0, 500) });
    throw new Error('AI response is not valid JSON');
  }

  return parsed;
}







