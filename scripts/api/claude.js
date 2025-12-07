// Claude API module for ClipAIble extension

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';

/**
 * Call Claude API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Claude API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callClaudeAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  log('callClaudeAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const requestBody = {
    model: model || 'claude-sonnet-4-5',
    max_tokens: 32000,
    messages: [
      { role: 'user', content: userPrompt }
    ]
  };
  
  // Claude uses system as a top-level parameter, not in messages
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }
  
  let response;
  
  try {
    log('Sending request to Claude API...');
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
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
            const error = new Error(errorData.error?.message || `Claude API error: ${fetchResponse.status}`);
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
          log(`Claude API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      logError('Claude API request timed out');
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
      throw new Error(errorData?.error?.message || `Claude API error: ${fetchError.status}`);
    }
    logError('Network error calling Claude', fetchError);
    throw new Error(`Network error: ${fetchError.message}`);
  }
  
  log('Claude response', { status: response.status, ok: response.ok });

  const result = await response.json();
  log('Claude response received', { contentLength: result.content?.[0]?.text?.length });
  
  // Claude returns content as array with text blocks
  const textContent = result.content?.find(c => c.type === 'text')?.text;
  
  if (jsonResponse && textContent) {
    try {
      return JSON.parse(textContent);
    } catch (e) {
      // Try to extract JSON from markdown code block
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      logError('Failed to parse Claude JSON response', e);
      throw new Error('Invalid JSON response from Claude');
    }
  }
  
  return textContent;
}

