import { createApiError, isApiBoundaryError } from './http-errors.js';
// @ts-check
// OpenRouter API module for ClipAIble extension

import { log, logError, logDebug, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { getDefaultModel, getModelMetadata } from '../utils/model-catalog.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { assertCompleteAIResponse } from './response-validation.js';
import { parseBase64Image } from './image-data.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/** @param {import('../types.js').AIRequestOptions} requestOptions */
async function checkResponseOwner(requestOptions) {
  await requestOptions.checkCancelled?.();
  requestOptions.signal?.throwIfAborted();
}

/** Every HTTP success, including a JSON fallback, has the same response checks. */
async function readOpenRouterResponse(response, requestOptions) {
  const result = await response.json().finally(() => checkResponseOwner(requestOptions));
  assertCompleteAIResponse(result, 'openrouter');
  return result;
}

/**
 * OpenRouter normalizes provider reasoning controls through its reasoning object.
 * @param {string} model
 * @param {import('../types.js').ModelRequestOptions} [options]
 */
export function getOpenRouterRequestConfig(model, { maxTokens, temperature, shortResponse = false, reasoningEffort: requestedEffort, imageInput = false } = {}) {
  const selected = typeof model === 'string' && model ? model : getDefaultModel('openrouter');
  const metadata = getModelMetadata('openrouter', selected, { strict: true });
  if (imageInput && metadata?.inputModalities && !metadata.inputModalities.includes('image')) throw Object.assign(new Error('The selected model does not support image input.'), { code: 'AI_MODEL_UNSUPPORTED_IMAGE' });
  const disabled = metadata?.reasoningEnabled === false;
  let effort = requestedEffort && metadata?.reasoningEfforts?.includes(requestedEffort) ? requestedEffort : metadata?.reasoningEffort;
  if (shortResponse && !disabled && metadata?.reasoningEfforts) {
    effort = metadata.reasoningEfforts.includes('none') ? 'none' : 'low';
  }
  /** @type {{model: string, reasoning?: {enabled?: boolean, effort?: string}, provider?: {require_parameters: boolean}, max_tokens?: number, temperature?: number, response_format?: {type: 'json_object'}}} */
  const parameters = { model: metadata?.apiModel || selected };
  if (disabled) parameters.reasoning = { enabled: false };
  else if (effort) parameters.reasoning = { effort };
  if (parameters.reasoning) parameters.provider = { require_parameters: true };
  const reasoning = Boolean(metadata?.reasoningEfforts?.length || metadata?.reasoningEffort || metadata?.reasoningEnabled !== undefined);
  if (maxTokens !== undefined && !(shortResponse && reasoning && !disabled && effort !== 'none')) parameters.max_tokens = maxTokens;
  if (temperature !== undefined && (!reasoning || disabled || effort === 'none')) parameters.temperature = temperature;
  return parameters;
}

/**
 * Call OpenRouter API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - Model name (format: provider/model-name)
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callOpenRouterAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callOpenRouterAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const requestConfig = getOpenRouterRequestConfig(model);
  const modelName = requestConfig.model;
  
  // Negotiate JSON output without changing model or reasoning settings.
  let useResponseFormat = jsonResponse;
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat, signal) {
    const requestBody = {
      ...requestConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    
    if (withResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
      // Use require_parameters to ensure provider supports response_format
      // This prevents routing to providers that don't support it
      requestBody.provider = {
        require_parameters: true
      };
    }
    
    const fetchResponse = await fetchBufferedResponse('https://openrouter.ai/api/v1/chat/completions', { signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/YanGranat/ClipAIble',
        'X-Title': 'ClipAIble'
      },
      body: JSON.stringify(requestBody)
    }, CONFIG.API_TIMEOUT_MS, requestOptions);
    
    // If not ok and retryable, throw error for retry logic
    if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'openrouter');

    return fetchResponse;

  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          ({ signal }) => makeRequest(true, signal),
          {
            signal: requestOptions.signal,
            checkCancelled: requestOptions.checkCancelled,
            onRetry: (attempt, delay) => {
              log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
            }
          }
        );
      } catch (error) {
        // If 400 error and error indicates response_format issue, retry without it
        if (error.status === 400 && error.retryWithoutResponseFormat) {
          logWarn('OpenRouter 400 error with response_format - retrying without it', {
            model: modelName,
            errorData: error.errorData,
            note: 'OpenRouter aggregator may not support response_format for this model'
          });
          useResponseFormat = false;
          // Retry without response_format
          response = await callWithRetry(
            ({ signal }) => makeRequest(false, signal),
            {
              signal: requestOptions.signal,
              checkCancelled: requestOptions.checkCancelled,
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
        } else {
          throw error;
        }
      }
    } else {
      // No response_format from start
      response = await callWithRetry(
        ({ signal }) => makeRequest(false, signal),
        {
          signal: requestOptions.signal,
          checkCancelled: requestOptions.checkCancelled,
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }

  log('OpenRouter response', { status: response.status, ok: response.ok });

  let result;
  try {
    result = await readOpenRouterResponse(response, requestOptions);
    log('OpenRouter response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage 
    });
  } catch (parseError) {
    await checkResponseOwner(requestOptions);
    if (isApiBoundaryError(parseError)) throw parseError;
    if (parseError.code === 'AI_RESPONSE_TRUNCATED') throw parseError;
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(parseError, {
      source: 'openrouter',
      errorType: 'parseError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'parseResponse',
        model: modelName,
        responseStatus: response?.status
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorFailedToParseResponse', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
  }

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content in response');
    const normalized = await handleError(noContentError, {
      source: 'openrouter',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        model: modelName,
        hasResult: !!result,
        hasChoices: !!result?.choices,
        choicesCount: result?.choices?.length || 0
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNoContentReceived', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
  }

  log('Response content', { length: content.length, preview: content.substring(0, 100) });

  if (!jsonResponse) {
    return content;
  }

  // Extract JSON from markdown code blocks if present
  // Some models (like Claude) return JSON wrapped in ```json ... ``` even with response_format
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    // Extract content from markdown code block
    const lines = jsonContent.split('\n');
    // Remove first line (```json or ```)
    lines.shift();
    // Remove last line (```)
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    jsonContent = lines.join('\n').trim();
    log('Extracted JSON from markdown code block', { 
      originalLength: content.length, 
      extractedLength: jsonContent.length,
      model: modelName 
    });
  }

  // Check if we requested JSON but got non-JSON response
  // This can happen if model doesn't support response_format but returns 200 anyway
  // Try to detect if content is JSON-like (starts with { or [)
  const isLikelyJSON = jsonContent.startsWith('{') || jsonContent.startsWith('[');
  
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (jsonError) {
    if (isApiBoundaryError(jsonError)) throw jsonError;
    // If we used response_format but got non-JSON, retry without it
    // This handles cases where model ignores response_format but returns 200
    if (useResponseFormat && !isLikelyJSON) {
      logWarn('OpenRouter model returned non-JSON despite response_format - retrying without it', {
        model: modelName,
        contentPreview: content.substring(0, 200),
        note: 'Model may not support response_format: { type: "json_object" }'
      });
      
      // Retry entire request without response_format
      useResponseFormat = false;
      const retryResponse = await callWithRetry(
        ({ signal }) => makeRequest(false, signal),
        {
          signal: requestOptions.signal,
          checkCancelled: requestOptions.checkCancelled,
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
          }
        }
      );
      
      const retryResult = await readOpenRouterResponse(retryResponse, requestOptions);
      const retryContent = retryResult.choices?.[0]?.message?.content;
      
      if (!retryContent) {
        const noContentError = new Error('No content in response');
        const normalized = await handleError(noContentError, {
          source: 'openrouter',
          errorType: 'apiNoContentError',
          logError: true,
          createUserMessage: true,
          context: {
            operation: 'validateContent',
            model: modelName,
            hasResult: !!retryResult,
            hasChoices: !!retryResult?.choices,
            choicesCount: retryResult?.choices?.length || 0
          }
        });
        
        const uiLang = await getUILanguageCached();
        const userMessage = normalized.userMessage || tSync('errorNoContentReceived', uiLang);
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
      
      // Extract JSON from markdown code blocks if present in retry content
      let retryJsonContent = retryContent.trim();
      if (retryJsonContent.startsWith('```')) {
        const lines = retryJsonContent.split('\n');
        lines.shift(); // Remove first line
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
          lines.pop(); // Remove last line
        }
        retryJsonContent = lines.join('\n').trim();
      }
      
      // Try to parse retry content as JSON
      try {
        return JSON.parse(retryJsonContent);
      } catch (retryJsonError) {
    if (isApiBoundaryError(retryJsonError)) throw retryJsonError;
        // Still not JSON - throw original error with context from both attempts
        const normalized = await handleError(jsonError, {
          source: 'openrouter',
          errorType: 'jsonParseError',
          logError: true,
          createUserMessage: false,
          context: {
            operation: 'parseJsonResponse',
            model: modelName,
            contentLength: content.length,
            contentPreview: content.substring(0, 500),
            retryContentLength: retryContent.length,
            retryContentPreview: retryContent.substring(0, 500)
          }
        });
        
        const uiLang = await getUILanguageCached();
        const userMessage = tSync('errorAiResponseNotValidJson', uiLang);
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
    }
    
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(jsonError, {
      source: 'openrouter',
      errorType: 'jsonParseError',
      logError: true,
      createUserMessage: false, // Keep existing localized message
      context: {
        operation: 'parseJsonResponse',
        model: modelName,
        contentLength: content.length,
        contentPreview: content.substring(0, 500)
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = tSync('errorAiResponseNotValidJson', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
  }

  return parsed;
}

/**
 * Call OpenRouter API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - Model name (format: provider/model-name)
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callOpenRouterAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callOpenRouterAPIWithImage', { model, imageSize: imageData.length });
  
  const requestConfig = getOpenRouterRequestConfig(model, { imageInput: true });
  const modelName = requestConfig.model;
  
  // Negotiate JSON output without changing model or reasoning settings.
  let useResponseFormat = jsonResponse;
  
  // Extract base64 data (remove data:image/png;base64, prefix)
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat, signal) {
    const requestBody = {
      ...requestConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    };
    
    if (withResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
      // Use require_parameters to ensure provider supports response_format
      // This prevents routing to providers that don't support it
      requestBody.provider = {
        require_parameters: true
      };
    }
    
    const fetchResponse = await fetchBufferedResponse('https://openrouter.ai/api/v1/chat/completions', { signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/YanGranat/ClipAIble',
        'X-Title': 'ClipAIble'
      },
      body: JSON.stringify(requestBody)
    }, CONFIG.API_TIMEOUT_MS, requestOptions);
    
    // If not ok and retryable, throw error for retry logic
    if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'openrouter');

    return fetchResponse;

  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API with image...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          ({ signal }) => makeRequest(true, signal),
          {
            signal: requestOptions.signal,
            checkCancelled: requestOptions.checkCancelled,
            onRetry: (attempt, delay) => {
              log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
            }
          }
        );
      } catch (error) {
        // If 400 error and error indicates response_format issue, retry without it
        if (error.status === 400 && error.retryWithoutResponseFormat) {
          logWarn('OpenRouter 400 error with response_format - retrying without it', {
            model: modelName,
            errorData: error.errorData,
            note: 'OpenRouter aggregator may not support response_format for this model'
          });
          useResponseFormat = false;
          // Retry without response_format
          response = await callWithRetry(
            ({ signal }) => makeRequest(false, signal),
            {
              signal: requestOptions.signal,
              checkCancelled: requestOptions.checkCancelled,
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
        } else {
          throw error;
        }
      }
    } else {
      // No response_format from start
      response = await callWithRetry(
        ({ signal }) => makeRequest(false, signal),
        {
          signal: requestOptions.signal,
          checkCancelled: requestOptions.checkCancelled,
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
    
    const data = await readOpenRouterResponse(response, requestOptions);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      logError('OpenRouter API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    if (jsonResponse) {
      // Extract JSON from markdown code blocks if present
      // Some models (like Claude) return JSON wrapped in ```json ... ``` even with response_format
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        const lines = jsonContent.split('\n');
        lines.shift(); // Remove first line
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
          lines.pop(); // Remove last line
        }
        jsonContent = lines.join('\n').trim();
        log('Extracted JSON from markdown code block', { 
          originalLength: content.length, 
          extractedLength: jsonContent.length,
          model: modelName 
        });
      }
      
      // Check if we requested JSON but got non-JSON response
      // This can happen if model doesn't support response_format but returns 200 anyway
      const isLikelyJSON = jsonContent.startsWith('{') || jsonContent.startsWith('[');
      
      try {
        return JSON.parse(jsonContent);
      } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
        // If we used response_format but got non-JSON, retry without it
        if (useResponseFormat && !isLikelyJSON) {
          logWarn('OpenRouter model returned non-JSON despite response_format - retrying without it', {
            model: modelName,
            contentPreview: content.substring(0, 200),
            note: 'Model may not support response_format: { type: "json_object" }'
          });
          
          // Retry entire request without response_format
          useResponseFormat = false;
          const retryResponse = await callWithRetry(
            ({ signal }) => makeRequest(false, signal),
            {
              signal: requestOptions.signal,
              checkCancelled: requestOptions.checkCancelled,
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
          
          const retryData = await readOpenRouterResponse(retryResponse, requestOptions);
          const retryContent = retryData.choices?.[0]?.message?.content;
          
          if (!retryContent) {
            logError('OpenRouter API response missing content', { data: retryData });
            throw new Error('No content in API response');
          }
          
          // Extract JSON from markdown code blocks if present in retry content
          let retryJsonContent = retryContent.trim();
          if (retryJsonContent.startsWith('```')) {
            const lines = retryJsonContent.split('\n');
            lines.shift(); // Remove first line
            if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
              lines.pop(); // Remove last line
            }
            retryJsonContent = lines.join('\n').trim();
          }
          
          // Try to parse retry content as JSON
          try {
            return JSON.parse(retryJsonContent);
          } catch (retryParseError) {
    if (isApiBoundaryError(retryParseError)) throw retryParseError;
            logError('Failed to parse OpenRouter response as JSON after retry', { content: retryContent, parseError: retryParseError });
            throw new Error(`Invalid JSON response from OpenRouter: ${retryParseError.message}`);
          }
        }
        
        logError('Failed to parse OpenRouter response as JSON', { content, parseError });
        throw new Error(`Invalid JSON response from OpenRouter: ${parseError.message}`);
      }
    }
    
    return content;
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    logError('OpenRouter API call with image failed', error);
    throw error;
  }
}

/**
 * Call OpenRouter API with image and conversation history
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<Object>} messageHistory - Previous messages [{role: 'user'|'assistant', content: string}]
 * @param {string} apiKey - OpenRouter API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<{result: Object|string, assistantMessage: string, userMessage: Object}>}
 */
export async function callOpenRouterAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callOpenRouterAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const requestConfig = getOpenRouterRequestConfig(model, { imageInput: true });
  const modelName = requestConfig.model;
  
  // Negotiate JSON output without changing model or reasoning settings.
  let useResponseFormat = jsonResponse;
  
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  // Build current user message with image
  const currentUserMessage = {
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64Image}` }
      }
    ]
  };
  
  // Build messages array with history
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory, // Previous messages (with images from previous pages)
    currentUserMessage // Current page with image
  ];
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat, signal) {
    const requestBody = {
      ...requestConfig,
      messages: messages
    };
    
    if (withResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
      // Use require_parameters to ensure provider supports response_format
      // This prevents routing to providers that don't support it
      requestBody.provider = {
        require_parameters: true
      };
    }
    
    const fetchResponse = await fetchBufferedResponse('https://openrouter.ai/api/v1/chat/completions', { signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/YanGranat/ClipAIble',
        'X-Title': 'ClipAIble'
      },
      body: JSON.stringify(requestBody)
    }, CONFIG.API_TIMEOUT_MS, requestOptions);
    
    // If not ok and retryable, throw error for retry logic
    if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'openrouter');

    return fetchResponse;

  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API with image and history...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          ({ signal }) => makeRequest(true, signal),
          {
            signal: requestOptions.signal,
            checkCancelled: requestOptions.checkCancelled,
            onRetry: (attempt, delay) => {
              log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
            }
          }
        );
      } catch (error) {
        // If 400 error and error indicates response_format issue, retry without it
        if (error.status === 400 && error.retryWithoutResponseFormat) {
          logWarn('OpenRouter 400 error with response_format - retrying without it', {
            model: modelName,
            errorData: error.errorData,
            note: 'OpenRouter aggregator may not support response_format for this model'
          });
          useResponseFormat = false;
          // Retry without response_format
          response = await callWithRetry(
            ({ signal }) => makeRequest(false, signal),
            {
              signal: requestOptions.signal,
              checkCancelled: requestOptions.checkCancelled,
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
        } else {
          throw error;
        }
      }
    } else {
      // No response_format from start
      response = await callWithRetry(
        ({ signal }) => makeRequest(false, signal),
        {
          signal: requestOptions.signal,
          checkCancelled: requestOptions.checkCancelled,
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
    
    const data = await readOpenRouterResponse(response, requestOptions);
    let content = data.choices?.[0]?.message?.content;
    if (!content) {
      logError('OpenRouter API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    let result;
    if (jsonResponse) {
      // Extract JSON from markdown code blocks if present
      // Some models (like Claude) return JSON wrapped in ```json ... ``` even with response_format
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        const lines = jsonContent.split('\n');
        lines.shift(); // Remove first line
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
          lines.pop(); // Remove last line
        }
        jsonContent = lines.join('\n').trim();
        log('Extracted JSON from markdown code block', { 
          originalLength: content.length, 
          extractedLength: jsonContent.length,
          model: modelName 
        });
      }
      
      // Check if we requested JSON but got non-JSON response
      // This can happen if model doesn't support response_format but returns 200 anyway
      const isLikelyJSON = jsonContent.startsWith('{') || jsonContent.startsWith('[');
      
      try {
        result = JSON.parse(jsonContent);
      } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
        // If we used response_format but got non-JSON, retry without it
        if (useResponseFormat && !isLikelyJSON) {
          logWarn('OpenRouter model returned non-JSON despite response_format - retrying without it', {
            model: modelName,
            contentPreview: content.substring(0, 200),
            note: 'Model may not support response_format: { type: "json_object" }'
          });
          
          // Retry entire request without response_format
          useResponseFormat = false;
          const retryResponse = await callWithRetry(
            ({ signal }) => makeRequest(false, signal),
            {
              signal: requestOptions.signal,
              checkCancelled: requestOptions.checkCancelled,
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
          
          const retryData = await readOpenRouterResponse(retryResponse, requestOptions);
          const retryContent = retryData.choices?.[0]?.message?.content;
          
          if (!retryContent) {
            logError('OpenRouter API response missing content', { data: retryData });
            throw new Error('No content in API response');
          }
          
          // Extract JSON from markdown code blocks if present in retry content
          let retryJsonContent = retryContent.trim();
          if (retryJsonContent.startsWith('```')) {
            const lines = retryJsonContent.split('\n');
            lines.shift(); // Remove first line
            if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
              lines.pop(); // Remove last line
            }
            retryJsonContent = lines.join('\n').trim();
          }
          
          // Try to parse retry content as JSON
          try {
            result = JSON.parse(retryJsonContent);
            // Update content for assistantMessage
            content = retryContent;
          } catch (retryParseError) {
    if (isApiBoundaryError(retryParseError)) throw retryParseError;
            logError('Failed to parse OpenRouter response as JSON after retry', { content: retryContent, parseError: retryParseError });
            throw new Error(`Invalid JSON response from OpenRouter: ${retryParseError.message}`);
          }
        } else {
          logError('Failed to parse OpenRouter response as JSON', { content, parseError });
          throw new Error(`Invalid JSON response from OpenRouter: ${parseError.message}`);
        }
      }
    } else {
      result = content;
    }
    
    return {
      result,
      assistantMessage: content, // Store for history
      userMessage: currentUserMessage // Store full user message with image for history
    };
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    logError('OpenRouter API call with image and history failed', error);
    throw error;
  }
}

