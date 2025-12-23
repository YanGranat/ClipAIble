// @ts-check
// OpenAI API module for ClipAIble extension

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';

/**
 * Parse model string to extract actual model name and reasoning settings
 * @param {string} model - Model string (e.g., "gpt-5.1-high", "gpt-5.2", "gpt-5.2-pro-2025-12-11")
 * @returns {Object} { modelName, reasoningEffort }
 */
export function parseModelConfig(model) {
  const defaultModel = 'gpt-5.1';
  if (!model) {
    return { modelName: defaultModel, reasoningEffort: null };
  }
  
  // Check for high reasoning suffix (e.g., gpt-5.1-high)
  if (model.endsWith('-high')) {
    const modelName = model.replace(/-high$/, '');
    return { modelName, reasoningEffort: 'high' };
  }
  
  // GPT-5.2 models use medium reasoning by default
  if (model === 'gpt-5.2' || model === 'gpt-5.2-pro-2025-12-11' || model.startsWith('gpt-5.2-pro')) {
    return { modelName: model, reasoningEffort: 'medium' };
  }
  
  // Default: no reasoning effort specified
  return { modelName: model, reasoningEffort: null };
}

/**
 * Call OpenAI API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callOpenAI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  log('callOpenAI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const { modelName, reasoningEffort } = parseModelConfig(model);
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
  
  if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  }
  
  let response;
  const requestStartTime = Date.now();
  
  try {
    log('Sending request to OpenAI...', { 
      model: modelName, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      reasoningEffort: reasoningEffort || 'none',
      timestamp: requestStartTime
    });
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        // Log periodic updates for long-running requests
        const progressInterval = setInterval(() => {
          const elapsed = Date.now() - requestStartTime;
          const elapsedSeconds = Math.round(elapsed / 1000);
          log('OpenAI API request still processing...', {
            elapsedSeconds,
            elapsedMinutes: Math.round(elapsedSeconds / 60 * 10) / 10,
            model: modelName,
            reasoningEffort: reasoningEffort || 'none'
          });
        }, 30000); // Log every 30 seconds
        
        try {
          const fetchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearInterval(progressInterval);
        
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
            const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            clearTimeout(timeout);
            throw error;
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearInterval(progressInterval);
          clearTimeout(timeout);
          throw e;
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`OpenAI API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      logError('OpenAI API request timed out');
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
      
      // Provide more helpful error messages for common errors
      let errorMessage = errorData?.error?.message || `API error: ${fetchError.status}`;
      if (fetchError.status === 404) {
        errorMessage = `Model "${modelName}" not found. The model may not be available yet or the name may be incorrect. Please try a different model (e.g., gpt-5.1 or gpt-5.2).`;
      } else if (fetchError.status === 401) {
        errorMessage = 'OpenAI API key is invalid or missing. Please check your API key in settings.';
      } else if (fetchError.status === 403) {
        errorMessage = 'OpenAI API access forbidden. Please check your API key permissions.';
      } else if (fetchError.status === 429) {
        errorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
      }
      
      throw new Error(errorMessage);
    }
    logError('Network error', fetchError);
    throw new Error(`Network error: ${fetchError.message}`);
  }

  const responseTime = Date.now() - requestStartTime;
  log('OpenAI response received', { 
    status: response.status, 
    ok: response.ok,
    responseTimeMs: responseTime,
    responseTimeSeconds: Math.round(responseTime / 1000)
  });

  let result;
  try {
    result = await response.json();
    const totalTime = Date.now() - requestStartTime;
    log('OpenAI response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage,
      totalTimeMs: totalTime,
      totalTimeSeconds: Math.round(totalTime / 1000)
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


