// @ts-check
// OpenRouter API module for ClipAIble extension

import { log, logError, logDebug, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

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
  
  // OpenRouter is an aggregator - response_format support varies by model and provider
  // According to OpenRouter docs, structured outputs (json_object/json_schema) are supported by:
  // - OpenAI models (GPT-4o and later)
  // - Google Gemini models
  // - Anthropic models (Sonnet 4.5 and Opus 4.1)
  // - Most open-source models
  // - All Fireworks provided models
  // We'll try with response_format for all models when jsonResponse=true, but fallback without it if we get 400 error
  // Using require_parameters: true ensures provider supports response_format
  const isOpenAIModel = modelName.startsWith('openai/');
  const isGoogleModel = modelName.startsWith('google/');
  const isAnthropicModel = modelName.startsWith('anthropic/');
  const isNitroModel = modelName.includes('nitro') || modelName.includes('nitro-');
  const isFireworksModel = modelName.includes('fireworks') || modelName.includes('@fireworks');
  
  // Most modern models support json_object (JSON mode), so we'll try for all when jsonResponse=true
  // The fallback logic will handle cases where it's not supported
  const likelySupportsResponseFormat = isOpenAIModel || isGoogleModel || isAnthropicModel || 
                                       isNitroModel || isFireworksModel || 
                                       modelName.includes('deepseek') || modelName.includes('mistralai') ||
                                       modelName.includes('qwen') || modelName.includes('z-ai') ||
                                       modelName.includes('nex-agi');
  
  // Try with response_format first if jsonResponse is requested
  // We'll be optimistic and try for all models, with fallback on 400 error
  let useResponseFormat = jsonResponse;
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat) {
    const requestBody = {
      model: modelName,
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
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    
    try {
      const fetchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
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
        // Non-retryable error - get error details
        let errorData;
        try {
          errorData = await fetchResponse.json();
        } catch (e) {
          errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
        }
        
        // Log full error details
        logError('OpenRouter API error response', {
          status: fetchResponse.status,
          errorData: JSON.stringify(errorData).substring(0, 500), // Truncate to avoid huge logs
          model: modelName,
          hasResponseFormat: withResponseFormat,
          note: 'OpenRouter is an aggregator - errors may come from underlying provider'
        });
        
        // For 400 errors with response_format, mark for retry without it
        // OpenRouter is an aggregator - even openai/* models may not support response_format
        if (fetchResponse.status === 400 && withResponseFormat) {
          const errorText = JSON.stringify(errorData).toLowerCase();
          // Check if error might be related to response_format
          // We'll be conservative and retry without it for any 400 when using response_format
          // This is safer than trying to parse specific error messages
          const mightBeResponseFormatIssue = errorText.includes('response_format') || 
            errorText.includes('response format') || 
            errorText.includes('unsupported') || 
            errorText.includes('invalid parameter') ||
            errorText.includes('bad request') ||
            !errorText.includes('api key') && !errorText.includes('unauthorized') && 
            !errorText.includes('forbidden') && !errorText.includes('rate limit');
          
          if (mightBeResponseFormatIssue) {
            // Return special marker to retry without response_format
            /** @type {Error & {status?: number, retryWithoutResponseFormat?: boolean, errorData?: any}} */
            const error = new Error('RETRY_WITHOUT_RESPONSE_FORMAT');
            error.status = 400;
            error.retryWithoutResponseFormat = true;
            error.errorData = errorData;
            logWarn('OpenRouter 400 error with response_format - will retry without it', {
              model: modelName,
              errorPreview: JSON.stringify(errorData).substring(0, 200),
              note: 'OpenRouter aggregator may not support response_format for this model'
            });
            throw error;
          }
        }
        
        // Provide more helpful error messages for common errors
        const uiLang = await getUILanguageCached();
        const errorMessageFromAPI = errorData.error?.message || errorData.message || errorData.error?.error?.message;
        let errorMessage = errorMessageFromAPI || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
        
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
        throw error;
      }
      
      return fetchResponse;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          () => makeRequest(true),
          {
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
            () => makeRequest(false),
            {
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
        () => makeRequest(false),
        {
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'openrouter',
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
      const userMessage = tSync('errorTimeout', uiLang);
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
        source: 'openrouter',
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
        errorMessage = errorData?.error?.message || tSync('errorApiError', uiLang).replace('{status}', String(fetchError.status));
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
      source: 'openrouter',
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
        () => makeRequest(false),
        {
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
          }
        }
      );
      
      const retryResult = await retryResponse.json();
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
export async function callOpenRouterAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  log('callOpenRouterAPIWithImage', { model, imageSize: imageData.length });
  
  const modelName = model || 'openai/gpt-4o';
  
  // OpenRouter is an aggregator - response_format support varies by model and provider
  // According to OpenRouter docs, structured outputs (json_object/json_schema) are supported by:
  // - OpenAI models (GPT-4o and later)
  // - Google Gemini models
  // - Anthropic models (Sonnet 4.5 and Opus 4.1)
  // - Most open-source models
  // - All Fireworks provided models
  // We'll try with response_format for all models when jsonResponse=true, but fallback without it if we get 400 error
  // Using require_parameters: true ensures provider supports response_format
  const isOpenAIModel = modelName.startsWith('openai/');
  const isGoogleModel = modelName.startsWith('google/');
  const isAnthropicModel = modelName.startsWith('anthropic/');
  const isNitroModel = modelName.includes('nitro') || modelName.includes('nitro-');
  const isFireworksModel = modelName.includes('fireworks') || modelName.includes('@fireworks');
  
  // Most modern models support json_object (JSON mode), so we'll try for all when jsonResponse=true
  // The fallback logic will handle cases where it's not supported
  const likelySupportsResponseFormat = isOpenAIModel || isGoogleModel || isAnthropicModel || 
                                       isNitroModel || isFireworksModel || 
                                       modelName.includes('deepseek') || modelName.includes('mistralai') ||
                                       modelName.includes('qwen') || modelName.includes('z-ai') ||
                                       modelName.includes('nex-agi');
  
  // Try with response_format first if jsonResponse is requested
  // We'll be optimistic and try for all models, with fallback on 400 error
  let useResponseFormat = jsonResponse;
  
  // Extract base64 data (remove data:image/png;base64, prefix)
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  // Internal function to make the actual API call
  async function makeRequest(withResponseFormat) {
    const requestBody = {
      model: modelName,
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
                url: `data:image/png;base64,${base64Image}`
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
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    
    try {
      const fetchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
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
        // Non-retryable error - get error details
        let errorData;
        try {
          errorData = await fetchResponse.json();
        } catch (e) {
          errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
        }
        
        // Log full error details
        logError('OpenRouter API error response', {
          status: fetchResponse.status,
          errorData: JSON.stringify(errorData).substring(0, 500), // Truncate to avoid huge logs
          model: modelName,
          hasResponseFormat: withResponseFormat,
          note: 'OpenRouter is an aggregator - errors may come from underlying provider'
        });
        
        // For 400 errors with response_format, mark for retry without it
        // OpenRouter is an aggregator - even openai/* models may not support response_format
        if (fetchResponse.status === 400 && withResponseFormat) {
          const errorText = JSON.stringify(errorData).toLowerCase();
          // Check if error might be related to response_format
          // We'll be conservative and retry without it for any 400 when using response_format
          const mightBeResponseFormatIssue = errorText.includes('response_format') || 
            errorText.includes('response format') || 
            errorText.includes('unsupported') || 
            errorText.includes('invalid parameter') ||
            errorText.includes('bad request') ||
            (!errorText.includes('api key') && !errorText.includes('unauthorized') && 
            !errorText.includes('forbidden') && !errorText.includes('rate limit'));
          
          if (mightBeResponseFormatIssue) {
            // Return special marker to retry without response_format
            /** @type {Error & {status?: number, retryWithoutResponseFormat?: boolean, errorData?: any}} */
            const error = new Error('RETRY_WITHOUT_RESPONSE_FORMAT');
            error.status = 400;
            error.retryWithoutResponseFormat = true;
            error.errorData = errorData;
            logWarn('OpenRouter 400 error with response_format - will retry without it', {
              model: modelName,
              errorPreview: JSON.stringify(errorData).substring(0, 200),
              note: 'OpenRouter aggregator may not support response_format for this model'
            });
            clearTimeout(timeout);
            throw error;
          }
        }
        
        // Provide more helpful error messages for common errors
        const uiLang = await getUILanguageCached();
        const errorMessageFromAPI = errorData.error?.message || errorData.message || errorData.error?.error?.message;
        let errorMessage = errorMessageFromAPI || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
        
        if (fetchResponse.status === 401) {
          errorMessage = tSync('errorApiKeyInvalid', uiLang);
        } else if (fetchResponse.status === 403) {
          errorMessage = tSync('errorApiAccessForbidden', uiLang);
        } else if (fetchResponse.status === 429) {
          errorMessage = tSync('errorRateLimit', uiLang);
        } else if (fetchResponse.status === 404) {
          // Check if this is a "model doesn't support images" error
          const errorText = errorMessageFromAPI?.toLowerCase() || '';
          if (errorText.includes('no endpoints found that support image input') || 
              errorText.includes('does not support image') ||
              errorText.includes('image input not supported')) {
            errorMessage = `Модель "${modelName}" не поддерживает обработку изображений. Выберите другую модель, которая поддерживает vision (например, anthropic/claude-sonnet-4.5, openai/gpt-4o, или google/gemini-pro-vision).`;
            logWarn('Model does not support image input', {
              model: modelName,
              error: errorMessageFromAPI,
              suggestion: 'User should select a vision-capable model'
            });
          }
        }
        
        /** @type {Error & {status?: number}} */
        const error = new Error(errorMessage);
        error.status = fetchResponse.status;
        clearTimeout(timeout);
        throw error;
      }
      
      clearTimeout(timeout);
      return fetchResponse;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API with image...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          () => makeRequest(true),
          {
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
            () => makeRequest(false),
            {
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
        () => makeRequest(false),
        {
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
    
    const data = await response.json();
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
            () => makeRequest(false),
            {
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
          
          const retryData = await retryResponse.json();
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
export async function callOpenRouterAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true) {
  log('callOpenRouterAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const modelName = model || 'openai/gpt-4o';
  
  // OpenRouter is an aggregator - response_format support varies by model and provider
  // According to OpenRouter docs, structured outputs (json_object/json_schema) are supported by:
  // - OpenAI models (GPT-4o and later)
  // - Google Gemini models
  // - Anthropic models (Sonnet 4.5 and Opus 4.1)
  // - Most open-source models
  // - All Fireworks provided models
  // We'll try with response_format for all models when jsonResponse=true, but fallback without it if we get 400 error
  // Using require_parameters: true ensures provider supports response_format
  const isOpenAIModel = modelName.startsWith('openai/');
  const isGoogleModel = modelName.startsWith('google/');
  const isAnthropicModel = modelName.startsWith('anthropic/');
  const isNitroModel = modelName.includes('nitro') || modelName.includes('nitro-');
  const isFireworksModel = modelName.includes('fireworks') || modelName.includes('@fireworks');
  
  // Most modern models support json_object (JSON mode), so we'll try for all when jsonResponse=true
  // The fallback logic will handle cases where it's not supported
  const likelySupportsResponseFormat = isOpenAIModel || isGoogleModel || isAnthropicModel || 
                                       isNitroModel || isFireworksModel || 
                                       modelName.includes('deepseek') || modelName.includes('mistralai') ||
                                       modelName.includes('qwen') || modelName.includes('z-ai') ||
                                       modelName.includes('nex-agi');
  
  // Try with response_format first if jsonResponse is requested
  // We'll be optimistic and try for all models, with fallback on 400 error
  let useResponseFormat = jsonResponse;
  
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  // Build current user message with image
  const currentUserMessage = {
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${base64Image}` }
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
  async function makeRequest(withResponseFormat) {
    const requestBody = {
      model: modelName,
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
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    
    try {
      const fetchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
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
        // Non-retryable error - get error details
        let errorData;
        try {
          errorData = await fetchResponse.json();
        } catch (e) {
          errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
        }
        
        // Log full error details
        logError('OpenRouter API error response', {
          status: fetchResponse.status,
          errorData: JSON.stringify(errorData).substring(0, 500), // Truncate to avoid huge logs
          model: modelName,
          hasResponseFormat: withResponseFormat,
          note: 'OpenRouter is an aggregator - errors may come from underlying provider'
        });
        
        // For 400 errors with response_format, mark for retry without it
        // OpenRouter is an aggregator - even openai/* models may not support response_format
        if (fetchResponse.status === 400 && withResponseFormat) {
          const errorText = JSON.stringify(errorData).toLowerCase();
          // Check if error might be related to response_format
          // We'll be conservative and retry without it for any 400 when using response_format
          const mightBeResponseFormatIssue = errorText.includes('response_format') || 
            errorText.includes('response format') || 
            errorText.includes('unsupported') || 
            errorText.includes('invalid parameter') ||
            errorText.includes('bad request') ||
            (!errorText.includes('api key') && !errorText.includes('unauthorized') && 
            !errorText.includes('forbidden') && !errorText.includes('rate limit'));
          
          if (mightBeResponseFormatIssue) {
            // Return special marker to retry without response_format
            /** @type {Error & {status?: number, retryWithoutResponseFormat?: boolean, errorData?: any}} */
            const error = new Error('RETRY_WITHOUT_RESPONSE_FORMAT');
            error.status = 400;
            error.retryWithoutResponseFormat = true;
            error.errorData = errorData;
            logWarn('OpenRouter 400 error with response_format - will retry without it', {
              model: modelName,
              errorPreview: JSON.stringify(errorData).substring(0, 200),
              note: 'OpenRouter aggregator may not support response_format for this model'
            });
            clearTimeout(timeout);
            throw error;
          }
        }
        
        // Provide more helpful error messages for common errors
        const uiLang = await getUILanguageCached();
        const errorMessageFromAPI = errorData.error?.message || errorData.message || errorData.error?.error?.message;
        let errorMessage = errorMessageFromAPI || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
        
        if (fetchResponse.status === 401) {
          errorMessage = tSync('errorApiKeyInvalid', uiLang);
        } else if (fetchResponse.status === 403) {
          errorMessage = tSync('errorApiAccessForbidden', uiLang);
        } else if (fetchResponse.status === 429) {
          errorMessage = tSync('errorRateLimit', uiLang);
        } else if (fetchResponse.status === 404) {
          // Check if this is a "model doesn't support images" error
          const errorText = errorMessageFromAPI?.toLowerCase() || '';
          if (errorText.includes('no endpoints found that support image input') || 
              errorText.includes('does not support image') ||
              errorText.includes('image input not supported')) {
            errorMessage = `Модель "${modelName}" не поддерживает обработку изображений. Выберите другую модель, которая поддерживает vision (например, anthropic/claude-sonnet-4.5, openai/gpt-4o, или google/gemini-pro-vision).`;
            logWarn('Model does not support image input', {
              model: modelName,
              error: errorMessageFromAPI,
              suggestion: 'User should select a vision-capable model'
            });
          }
        }
        
        /** @type {Error & {status?: number}} */
        const error = new Error(errorMessage);
        error.status = fetchResponse.status;
        clearTimeout(timeout);
        throw error;
      }
      
      clearTimeout(timeout);
      return fetchResponse;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
  
  let response;
  
  try {
    logDebug('Sending request to OpenRouter API with image and history...');
    
    // Try with response_format first if applicable
    if (useResponseFormat) {
      try {
        response = await callWithRetry(
          () => makeRequest(true),
          {
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
            () => makeRequest(false),
            {
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
        () => makeRequest(false),
        {
          onRetry: (attempt, delay) => {
            log(`OpenRouter API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    }
    
    const data = await response.json();
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
            () => makeRequest(false),
            {
              onRetry: (attempt, delay) => {
                log(`OpenRouter API retry attempt ${attempt} (without response_format), waiting ${delay}ms...`);
              }
            }
          );
          
          const retryData = await retryResponse.json();
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
    logError('OpenRouter API call with image and history failed', error);
    throw error;
  }
}







