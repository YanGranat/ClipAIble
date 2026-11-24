import { createApiError, isApiBoundaryError } from './http-errors.js';
// @ts-check
// Grok (xAI) API module for ClipAIble extension

import { log, logError, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { getDefaultModel, getModelMetadata } from '../utils/model-catalog.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { assertCompleteAIResponse } from './response-validation.js';
import { parseBase64Image } from './image-data.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Build supported parameters for a managed model while preserving custom IDs.
 * @param {string} model
 * @param {import('../types.js').ModelRequestOptions} [options]
 */
export function getGrokRequestConfig(model, { maxTokens, temperature, shortResponse = false, reasoningEffort: requestedEffort, imageInput = false } = {}) {
  const selected = typeof model === 'string' && model ? model : getDefaultModel('grok');
  const metadata = getModelMetadata('grok', selected, { strict: true });
  if (imageInput && metadata?.inputModalities && !metadata.inputModalities.includes('image')) throw Object.assign(new Error('The selected model does not support image input.'), { code: 'AI_MODEL_UNSUPPORTED_IMAGE' });
  let effort = requestedEffort && metadata?.reasoningEfforts?.includes(requestedEffort) ? requestedEffort : metadata?.reasoningEffort;
  if (shortResponse && metadata?.reasoningEfforts) {
    effort = metadata.reasoningEfforts.includes('none') ? 'none' : 'low';
  }
  /** @type {{model: string, reasoning_effort?: string, max_tokens?: number, temperature?: number, response_format?: {type: 'json_object'}}} */
  const parameters = { model: metadata?.apiModel || selected };
  if (effort) parameters.reasoning_effort = effort;
  const reasoning = Boolean(metadata?.reasoningEfforts?.length || metadata?.reasoningEffort);
  if (maxTokens !== undefined && !(shortResponse && reasoning && effort !== 'none')) parameters.max_tokens = maxTokens;
  if (temperature !== undefined && (!reasoning || effort === 'none')) parameters.temperature = temperature;
  return parameters;
}

/**
 * Call Grok API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Grok API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGrokAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callGrokAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const requestConfig = getGrokRequestConfig(model);
  const modelName = requestConfig.model;
  const requestBody = {
    ...requestConfig,
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
    logDebug('Sending request to Grok API...');
    
    // Use retry wrapper for fetch
    // Each retry has an independent request deadline.
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.x.ai/v1/chat/completions', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
        
        // If not ok and retryable, throw error for retry logic
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'grok');

        return fetchResponse;

      },
      {
        signal: requestOptions.signal,
        checkCancelled: requestOptions.checkCancelled,
        onRetry: (attempt, delay) => {
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }

  log('Grok response', { status: response.status, ok: response.ok });

  let result;
  try {
    result = await response.json();
    assertCompleteAIResponse(result, 'grok');
    log('Grok response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage 
    });
  } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
    if (parseError.code === 'AI_RESPONSE_TRUNCATED') throw parseError;
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(parseError, {
      source: 'grok',
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
    const userMessage = tSync('errorFailedToParseResponse', uiLang);
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
      source: 'grok',
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
  // Some models return JSON wrapped in ```json ... ``` even with response_format
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

  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (jsonError) {
    if (isApiBoundaryError(jsonError)) throw jsonError;
    logDebug('Initial JSON parse failed, attempting extraction', {
      model: modelName,
      contentLength: jsonContent.length,
      startsWithBrace: jsonContent.startsWith('{'),
      startsWithBracket: jsonContent.startsWith('['),
      firstChars: jsonContent.substring(0, 200)
    });
    
    // If parsing fails, try to extract JSON from the beginning of the response
    // This handles cases where model returns JSON followed by additional text (e.g., reasoning tokens)
    if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
      // Try to find the end of the first valid JSON object/array
      let jsonEnd = -1;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      const isObject = jsonContent.startsWith('{');
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) {
          continue;
        }
        
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && isObject) {
            jsonEnd = i + 1;
            break;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && !isObject) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonEnd > 0) {
        try {
          const extractedJson = jsonContent.substring(0, jsonEnd);
          log('Extracted JSON from beginning of response (additional text after JSON)', {
            originalLength: jsonContent.length,
            extractedLength: extractedJson.length,
            model: modelName
          });
          parsed = JSON.parse(extractedJson);
        } catch (extractError) {
    if (isApiBoundaryError(extractError)) throw extractError;
          // Fall through to original error
        }
      }
    }
    
    // If still not parsed, throw error
    if (!parsed) {
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(jsonError, {
        source: 'grok',
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
  }

  return parsed;
}

/**
 * Call Grok API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - Grok API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGrokAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callGrokAPIWithImage', { model, imageSize: imageData.length });
  
  const requestConfig = getGrokRequestConfig(model, { imageInput: true });
  const modelName = requestConfig.model;
  
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  const requestBody = {
    ...requestConfig,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` }
          }
        ]
      }
    ]
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  
  try {
    logDebug('Sending request to Grok API with image...');
    
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.x.ai/v1/chat/completions', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
          
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'grok');

        return fetchResponse;

      },
      {
        signal: requestOptions.signal,
        checkCancelled: requestOptions.checkCancelled,
        onRetry: (attempt, delay) => {
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }

  let result;
  try {
    result = await response.json();
    assertCompleteAIResponse(result, 'grok');
  } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
    if (parseError.code === 'AI_RESPONSE_TRUNCATED') throw parseError;
    const normalized = await handleError(parseError, {
      source: 'grok',
      errorType: 'parseError',
      logError: true,
      createUserMessage: true,
      context: {
        operation: 'parseResponse',
        model: modelName,
        responseStatus: response?.status
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = tSync('errorFailedToParseResponse', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }

  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    const noContentError = new Error('No content in response');
    const normalized = await handleError(noContentError, {
      source: 'grok',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true,
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
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    const lines = jsonContent.split('\n');
    lines.shift();
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    jsonContent = lines.join('\n').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (jsonError) {
    if (isApiBoundaryError(jsonError)) throw jsonError;
    // Try to extract JSON from beginning if parsing fails
    if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
      let jsonEnd = -1;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      const isObject = jsonContent.startsWith('{');
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) {
          continue;
        }
        
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && isObject) {
            jsonEnd = i + 1;
            break;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && !isObject) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonEnd > 0) {
        try {
          parsed = JSON.parse(jsonContent.substring(0, jsonEnd));
        } catch (extractError) {
    if (isApiBoundaryError(extractError)) throw extractError;
          // Fall through to original error
        }
      }
    }
    
    if (!parsed) {
      const normalized = await handleError(jsonError, {
        source: 'grok',
        errorType: 'jsonParseError',
        logError: true,
        createUserMessage: false,
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
  }

  return parsed;
}

/**
 * Call Grok API with image and conversation history
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<Object>} messageHistory - Previous messages [{role: 'user'|'assistant', content: string|Object}]
 * @param {string} apiKey - Grok API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<{result: Object|string, assistantMessage: string, userMessage: Object}>}
 */
export async function callGrokAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callGrokAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const requestConfig = getGrokRequestConfig(model, { imageInput: true });
  const modelName = requestConfig.model;
  
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  // Build current user message with image (OpenAI-compatible format)
  const imageUrl = `data:${mimeType};base64,${base64Image}`;
  
  const currentUserMessage = {
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      {
        type: 'image_url',
        image_url: { url: imageUrl }
      }
    ]
  };
  
  // Build messages array with history
  const messages = [
    { role: 'system', content: systemPrompt },
    ...messageHistory, // Previous messages (with images from previous pages)
    currentUserMessage // Current page with image
  ];
  
  const requestBody = {
    ...requestConfig,
    messages: messages
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  
  try {
    logDebug('Sending request to Grok API with image and history...');
    
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.x.ai/v1/chat/completions', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
          
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'grok');

        return fetchResponse;

      },
      {
        signal: requestOptions.signal,
        checkCancelled: requestOptions.checkCancelled,
        onRetry: (attempt, delay) => {
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }

  let result;
  try {
    result = await response.json();
    assertCompleteAIResponse(result, 'grok');
  } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
    if (parseError.code === 'AI_RESPONSE_TRUNCATED') throw parseError;
    const normalized = await handleError(parseError, {
      source: 'grok',
      errorType: 'parseError',
      logError: true,
      createUserMessage: true,
      context: {
        operation: 'parseResponse',
        model: modelName,
        responseStatus: response?.status
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = tSync('errorFailedToParseResponse', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }

  const content = result.choices?.[0]?.message?.content;
  const assistantMessage = content || '';

  if (!content) {
    const noContentError = new Error('No content in response');
    const normalized = await handleError(noContentError, {
      source: 'grok',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true,
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

  if (!jsonResponse) {
    return { result: content, assistantMessage, userMessage: currentUserMessage };
  }

  // Extract JSON from markdown code blocks if present
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    const lines = jsonContent.split('\n');
    lines.shift();
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    jsonContent = lines.join('\n').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (jsonError) {
    if (isApiBoundaryError(jsonError)) throw jsonError;
    // Try to extract JSON from beginning if parsing fails
    if (jsonContent.startsWith('{') || jsonContent.startsWith('[')) {
      let jsonEnd = -1;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      const isObject = jsonContent.startsWith('{');
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) {
          continue;
        }
        
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && isObject) {
            jsonEnd = i + 1;
            break;
          }
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0 && !isObject) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonEnd > 0) {
        try {
          parsed = JSON.parse(jsonContent.substring(0, jsonEnd));
        } catch (extractError) {
    if (isApiBoundaryError(extractError)) throw extractError;
          // Fall through to original error
        }
      }
    }
    
    if (!parsed) {
      const normalized = await handleError(jsonError, {
        source: 'grok',
        errorType: 'jsonParseError',
        logError: true,
        createUserMessage: false,
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
  }

  return { result: parsed, assistantMessage, userMessage: currentUserMessage };
}

