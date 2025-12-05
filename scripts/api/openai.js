// OpenAI API module for Webpage to PDF extension

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';

/**
 * Parse model string to extract actual model name and reasoning settings
 * @param {string} model - Model string (e.g., "gpt-5.1-high")
 * @returns {Object} { modelName, useHighReasoning }
 */
export function parseModelConfig(model) {
  const defaultModel = 'gpt-5.1';
  if (!model) {
    return { modelName: defaultModel, useHighReasoning: false };
  }
  
  const useHighReasoning = model.endsWith('-high');
  const modelName = useHighReasoning ? model.replace(/-high$/, '') : model;
  
  return { modelName, useHighReasoning };
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
  
  const { modelName, useHighReasoning } = parseModelConfig(model);
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
  
  if (useHighReasoning) {
    requestBody.reasoning_effort = 'high';
  }
  
  let response;
  
  try {
    log('Sending request to OpenAI...');
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
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
        
          // If not ok and retryable, throw error for retry logic
          if (!fetchResponse.ok) {
            const retryableCodes = [429, 500, 502, 503, 504];
            if (retryableCodes.includes(fetchResponse.status)) {
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
            const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
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
      throw new Error(errorData?.error?.message || `API error: ${fetchError.status}`);
    }
    logError('Network error', fetchError);
    throw new Error(`Network error: ${fetchError.message}`);
  }

  log('OpenAI response', { status: response.status, ok: response.ok });

  let result;
  try {
    result = await response.json();
    log('OpenAI response parsed', { 
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


