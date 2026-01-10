// @ts-check
// OpenAI API module for ClipAIble extension

import { log, logError, criticalLog, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Parse model string to extract actual model name and reasoning settings
 * @param {string} model - Model string (e.g., "gpt-5.1-high", "gpt-5.2", "gpt-5.2-pro-2025-12-11")
 * @returns {{modelName: string, reasoningEffort: string|null}} Parsed model configuration
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
 * @param {boolean} [jsonResponse=true] - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON response if jsonResponse is true, text response if jsonResponse is false
 * @throws {Error} If API key is missing
 * @throws {Error} If OpenAI API request fails
 * @throws {Error} If network error occurs
 * @throws {Error} If timeout occurs
 * @throws {Error} If response parsing fails
 * @example
 * // Call OpenAI API with JSON response
 * const response = await callOpenAI(
 *   'You are a helpful assistant.',
 *   'Extract key points from this text.',
 *   'sk-...',
 *   'gpt-4o',
 *   true
 * );
 * console.log('Extracted points:', response.content);
 * @example
 * // Call OpenAI API with text response
 * const text = await callOpenAI(
 *   'You are a translator.',
 *   'Translate: Hello world',
 *   'sk-...',
 *   'gpt-4o',
 *   false
 * );
 * console.log('Translation:', text);
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
    // CRITICAL: Log full prompts for debugging PDF processing issues
    log('=== OPENAI REQUEST: FULL PROMPTS ===', {
      model: modelName,
      systemPromptFull: systemPrompt,
      userPromptFull: userPrompt,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      reasoningEffort: reasoningEffort || 'none',
      jsonResponse,
      timestamp: requestStartTime
    });
    
    logDebug('Sending request to OpenAI...', { 
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
        let progressInterval = setInterval(() => {
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
            const error = new Error(errorData.error?.message || `API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            throw error;
          }
          
          return fetchResponse;
        } catch (e) {
          throw e;
        } finally {
          // CRITICAL: Always clear timers in finally to prevent memory leaks
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          if (timeout) {
            clearTimeout(timeout);
          }
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
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'openai',
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
      
      // Normalize HTTP error with context
      /** @type {import('../types.js').ExtendedError} */
      const httpError = new Error(errorMessage);
      httpError.status = fetchError.status;
      const normalized = await handleError(httpError, {
        source: 'openai',
        errorType: 'httpError',
        logError: true,
        createUserMessage: false, // Keep existing user message
        context: {
          operation: 'fetchRequest',
          model: modelName,
          statusCode: fetchError.status,
          errorData: errorData?.error
        }
      });
      
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
      source: 'openai',
      errorType: 'networkError',
      logError: true,
      createUserMessage: false, // Keep existing localized message
      context: {
        operation: 'fetchRequest',
        model: modelName,
        errorName: fetchError.name
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = tSync('errorNetwork', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code; // Will be NETWORK_ERROR
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
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
    
    // CRITICAL: Log full response for debugging PDF processing issues
    const responseContent = result?.choices?.[0]?.message?.content || '';
    log('=== OPENAI RESPONSE: FULL CONTENT ===', {
      model: modelName,
      responseFull: responseContent,
      responseLength: responseContent.length,
      responseTimeMs: totalTime,
      usage: result?.usage,
      hasChoices: !!result?.choices,
      choicesCount: result?.choices?.length || 0,
      timestamp: Date.now()
    });
    
    log('OpenAI response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage,
      totalTimeMs: totalTime,
      totalTimeSeconds: Math.round(totalTime / 1000)
    });
  } catch (parseError) {
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(parseError, {
      source: 'openai',
      errorType: 'responseParseError',
      logError: true,
      createUserMessage: false, // Keep existing localized message
      context: {
        operation: 'parseResponse',
        model: modelName,
        responseStatus: response?.status
      }
    });
    
    // Use existing localized user message, but throw normalized error with code
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
      source: 'openai',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        model: modelName,
        hasResult: !!result,
        hasChoices: !!result?.choices,
        choicesCount: result?.choices?.length || 0,
        resultKeys: result ? Object.keys(result) : []
      }
    });
    
    // Use centralized user message with fallback
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

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (jsonError) {
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(jsonError, {
      source: 'openai',
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
    
    // Use existing localized user message, but throw normalized error with code
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
 * Call OpenAI API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callOpenAIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  log('callOpenAIWithImage', { model, imageSize: imageData.length });
  
  const { modelName, reasoningEffort } = parseModelConfig(model);
  
  // Extract base64 data and detect MIME type from imageData
  let base64Image;
  let mimeType = 'image/png'; // Default to PNG
  if (imageData.includes(',')) {
    const parts = imageData.split(',');
    base64Image = parts[1];
    // Extract MIME type from data URL prefix (e.g., "data:image/jpeg;base64," or "data:image/png;base64,")
    const prefix = parts[0];
    if (prefix.includes('image/jpeg') || prefix.includes('image/jpg')) {
      mimeType = 'image/jpeg';
    } else if (prefix.includes('image/png')) {
      mimeType = 'image/png';
    } else if (prefix.includes('image/webp')) {
      mimeType = 'image/webp';
    }
  } else {
    base64Image = imageData;
  }
  
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
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
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
    logDebug('Sending request to OpenAI with image...', { 
      model: modelName, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      imageSize: base64Image.length
    });
    
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
            /** @type {Error & {status?: number}} */
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
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      // Normalize error with context for better logging and error tracking
      const noContentError = new Error('No content in API response');
      const normalized = await handleError(noContentError, {
        source: 'openai',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'validateContent',
          model: modelName,
          hasData: !!data,
          hasChoices: !!data?.choices,
          choicesCount: data?.choices?.length || 0
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
    
    if (jsonResponse) {
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // Normalize error with context for better logging and error tracking
        const normalized = await handleError(parseError, {
          source: 'openai',
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
        const error = new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
    }
    
    return content;
  } catch (error) {
    // Re-throw if already normalized, otherwise normalize
    if (error.code) {
      throw error;
    }
    logError('OpenAI API call with image failed', error);
    throw error;
  }
}

/**
 * Call OpenAI API with image and conversation history
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<Object>} messageHistory - Previous messages [{role: 'user'|'assistant', content: string}]
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<{result: Object|string, assistantMessage: string, userMessage: Object}>}
 */
export async function callOpenAIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true) {
  log('callOpenAIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const { modelName, reasoningEffort } = parseModelConfig(model);
  
  // Extract base64 data and detect MIME type from imageData
  let base64Image;
  let mimeType = 'image/png'; // Default to PNG
  if (imageData.includes(',')) {
    const parts = imageData.split(',');
    base64Image = parts[1];
    // Extract MIME type from data URL prefix (e.g., "data:image/jpeg;base64," or "data:image/png;base64,")
    const prefix = parts[0];
    if (prefix.includes('image/jpeg') || prefix.includes('image/jpg')) {
      mimeType = 'image/jpeg';
    } else if (prefix.includes('image/png')) {
      mimeType = 'image/png';
    } else if (prefix.includes('image/webp')) {
      mimeType = 'image/webp';
    }
  } else {
    base64Image = imageData;
  }
  
  // Calculate image hash for verification (first 100 chars of base64)
  const imageHashStart = base64Image.substring(0, 100);
  const imageHashEnd = base64Image.substring(Math.max(0, base64Image.length - 100));
  
  // Build current user message with image
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
  
  log('[ClipAIble OpenAI] === BUILDING CHAT MESSAGES ===', {
    systemPromptLength: systemPrompt.length,
    historyLength: messageHistory.length,
    historyMessages: messageHistory.map((msg, idx) => {
      const hasImage = Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url' || c.image_url || c.inline_data);
      let imageHashInfo = null;
      if (hasImage && Array.isArray(msg.content)) {
        const imageContent = msg.content.find(c => c.type === 'image_url' || c.image_url || c.inline_data);
        if (imageContent) {
          const imgData = imageContent.image_url?.url || imageContent.inline_data?.data || '';
          const base64Img = imgData.includes(',') ? imgData.split(',')[1] : imgData;
          imageHashInfo = {
            hashStart: base64Img.substring(0, 50),
            hashEnd: base64Img.substring(Math.max(0, base64Img.length - 50))
          };
        }
      }
      return {
        index: idx,
        role: msg.role,
        hasImage,
        imageHashInfo,
        contentLength: typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length
      };
    }),
    currentMessage: {
      role: currentUserMessage.role,
      hasImage: true,
      imageSize: base64Image.length,
      imageHashStart: imageHashStart,
      imageHashEnd: imageHashEnd,
      textLength: userPrompt.length
    },
    totalMessages: messages.length
  });
  
  const requestBody = {
    model: modelName,
    messages: messages
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  }
  
  // CRITICAL: Log full request body to see what we're sending
  log('[ClipAIble OpenAI] === REQUEST BODY (BEFORE SENDING) ===', {
    model: modelName,
    messagesCount: messages.length,
    hasSystemMessage: messages.some(m => m.role === 'system'),
    hasUserMessages: messages.filter(m => m.role === 'user').length,
    hasAssistantMessages: messages.filter(m => m.role === 'assistant').length,
    currentUserMessageHasImage: Array.isArray(currentUserMessage.content) && currentUserMessage.content.some(c => c.type === 'image_url'),
    currentUserMessageImageSize: (() => {
      if (Array.isArray(currentUserMessage.content)) {
        const imageContent = currentUserMessage.content.find(c => c.type === 'image_url');
        if (imageContent?.image_url?.url) {
          const base64 = imageContent.image_url.url.split(',')[1] || '';
          return base64.length;
        }
      }
      return 0;
    })(),
    requestBodyPreview: JSON.stringify(requestBody).substring(0, 500) + (JSON.stringify(requestBody).length > 500 ? '...' : ''), // Truncated preview only
    jsonResponse,
    hasResponseFormat: !!requestBody.response_format,
    hasReasoningEffort: !!requestBody.reasoning_effort
  });
  
  let response;
  const requestStartTime = Date.now();
  
  try {
    logDebug('Sending request to OpenAI with image and history...', { 
      model: modelName, 
      messagesCount: messages.length,
      imageSize: base64Image.length
    });
    
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
            /** @type {Error & {status?: number}} */
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
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      // Normalize error with context for better logging and error tracking
      const noContentError = new Error('No content in API response');
      const normalized = await handleError(noContentError, {
        source: 'openai',
      errorType: 'apiNoContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'validateContent',
          model: modelName,
          hasData: !!data,
          hasChoices: !!data?.choices,
          choicesCount: data?.choices?.length || 0,
          messagesCount: messages.length
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
    
    let result;
    if (jsonResponse) {
      try {
        result = JSON.parse(content);
      } catch (parseError) {
        // Normalize error with context for better logging and error tracking
        const normalized = await handleError(parseError, {
          source: 'openai',
          errorType: 'jsonParseError',
          logError: true,
          createUserMessage: false, // Keep existing message format
          context: {
            operation: 'parseJsonResponse',
            model: modelName,
            contentLength: content.length,
            contentPreview: content.substring(0, 500),
            messagesCount: messages.length
          }
        });
        
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
        error.code = normalized.code;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
    } else {
      result = content;
    }
    
    const responseData = {
      result,
      assistantMessage: content, // Store for history
      userMessage: currentUserMessage // Store full user message with image for history
    };
    
    // CRITICAL: Log full response details to understand what LLM returns
    // CRITICAL: Log RAW content BEFORE JSON.parse to see what LLM actually returned
    log('[ClipAIble OpenAI] === RAW CONTENT FROM API (BEFORE JSON.PARSE) ===', {
      contentLength: content.length,
      contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
      hasTextField: content.includes('"text"'),
      textFieldValue: (() => {
        // Try to extract text field value from raw content string
        const textMatch = content.match(/"text"\s*:\s*"([^"]*)"/);
        if (textMatch) {
          return {
            found: true,
            valuePreview: textMatch[1].substring(0, 200) + (textMatch[1].length > 200 ? '...' : ''),
            length: textMatch[1].length,
            isEmpty: textMatch[1].length === 0
          };
        }
        return { found: false };
      })()
    });
    
    log('[ClipAIble OpenAI] === CHAT RESPONSE RECEIVED ===', {
      input: {
        historyLength: messageHistory.length,
        currentImageSize: base64Image.length
      },
      output: {
        resultType: typeof result,
        resultIsString: typeof result === 'string',
        resultIsObject: typeof result === 'object' && result !== null,
        resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length,
        resultPreview: typeof result === 'string' ? result.substring(0, 300) + '...' : JSON.stringify(result).substring(0, 300) + '...',
        // If result is object, log text field specifically (truncated)
        resultTextField: typeof result === 'object' && result !== null && 'text' in result
          ? (typeof result.text === 'string' 
              ? {
                  preview: result.text.substring(0, 300) + (result.text.length > 300 ? '...' : ''),
                  length: result.text.length
                }
              : `[${typeof result.text}]`)
          : null,
        resultTextFieldType: typeof result === 'object' && result !== null && 'text' in result
          ? typeof result.text
          : null,
        resultKeys: typeof result === 'object' && result !== null ? Object.keys(result) : null,
        assistantMessageLength: content.length,
        assistantMessagePreview: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
        userMessageHasImage: true
      },
      newHistoryLength: messageHistory.length + 2, // userMessage + assistantMessage will be added
      duration: Date.now() - requestStartTime
    });
    
    return responseData;
  } catch (error) {
    logError('OpenAI API call with image and history failed', error);
    throw error;
  }
}

