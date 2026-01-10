// @ts-check
// Grok (xAI) API module for ClipAIble extension

import { log, logError, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Call Grok API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Grok API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callGrokAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true) {
  log('callGrokAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const modelName = model || 'grok-4-1-fast-reasoning';
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
    logDebug('Sending request to Grok API...');
    
    // Use retry wrapper for fetch
    // Create new AbortController for each retry attempt to avoid timeout conflict
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.x.ai/v1/chat/completions', {
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
            
            // Provide more helpful error messages for common errors
            const uiLang = await getUILanguageCached();
            let errorMessage = errorData.error?.message || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
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
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'grok',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
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
        source: 'grok',
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
      source: 'grok',
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

  log('Grok response', { status: response.status, ok: response.ok });

  let result;
  try {
    result = await response.json();
    log('Grok response parsed', { 
      id: result.id, 
      model: result.model,
      usage: result.usage 
    });
  } catch (parseError) {
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
export async function callGrokAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  log('callGrokAPIWithImage', { model, imageSize: imageData.length });
  
  const modelName = model || 'grok-4-1-fast-reasoning';
  
  // Extract base64 data and detect MIME type from imageData
  let base64Image;
  let mimeType = 'image/png'; // Default to PNG
  if (imageData.includes(',')) {
    const parts = imageData.split(',');
    base64Image = parts[1];
    // Extract MIME type from data URL prefix
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
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.x.ai/v1/chat/completions', {
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
              throw error;
            }
            
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            
            const uiLang = await getUILanguageCached();
            let errorMessage = errorData.error?.message || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
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
        } catch (e) {
          throw e;
        } finally {
          if (timeout) {
            clearTimeout(timeout);
          }
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      const normalized = await handleError(fetchError, {
        source: 'grok',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: true,
        context: {
          operation: 'fetchRequestWithImage',
          model: modelName,
          errorName: 'AbortError'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorTimeout', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    if (fetchError.status) {
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      
      /** @type {import('../types.js').ExtendedError} */
      const httpError = new Error(`HTTP ${fetchError.status}`);
      httpError.status = fetchError.status;
      const normalized = await handleError(httpError, {
        source: 'grok',
        errorType: 'httpError',
        logError: true,
        createUserMessage: true,
        context: {
          operation: 'fetchRequestWithImage',
          model: modelName,
          statusCode: fetchError.status,
          errorData: errorData?.error
        }
      });
      
      const uiLang = await getUILanguageCached();
      let errorMessage = normalized.userMessage;
      if (!errorMessage) {
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
      error.code = normalized.code;
      error.status = fetchError.status;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    const normalized = await handleError(fetchError, {
      source: 'grok',
      errorType: 'networkError',
      logError: true,
      createUserMessage: true,
      context: {
        operation: 'fetchRequestWithImage',
        model: modelName,
        errorName: fetchError.name
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNetwork', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch (parseError) {
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
export async function callGrokAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true) {
  log('callGrokAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const modelName = model || 'grok-4-1-fast-reasoning';
  
  // Extract base64 data and detect MIME type from imageData
  let base64Image;
  let mimeType = 'image/png'; // Default to PNG
  if (imageData.includes(',')) {
    const parts = imageData.split(',');
    base64Image = parts[1];
    // Extract MIME type from data URL prefix
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
    model: modelName,
    messages: messages
  };
  
  if (jsonResponse) {
    requestBody.response_format = { type: 'json_object' };
  }
  
  let response;
  
  try {
    logDebug('Sending request to Grok API with image and history...');
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.x.ai/v1/chat/completions', {
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
              throw error;
            }
            
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            
            const uiLang = await getUILanguageCached();
            let errorMessage = errorData.error?.message || tSync('errorApiError', uiLang).replace('{status}', String(fetchResponse.status));
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
        } catch (e) {
          throw e;
        } finally {
          if (timeout) {
            clearTimeout(timeout);
          }
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`Grok API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      const normalized = await handleError(fetchError, {
        source: 'grok',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: true,
        context: {
          operation: 'fetchRequestWithImage',
          model: modelName,
          errorName: 'AbortError'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorTimeout', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    if (fetchError.status) {
      let errorData;
      try {
        errorData = await fetchError.response?.json();
      } catch (e) {
        errorData = { error: { message: `HTTP ${fetchError.status}` } };
      }
      
      /** @type {import('../types.js').ExtendedError} */
      const httpError = new Error(`HTTP ${fetchError.status}`);
      httpError.status = fetchError.status;
      const normalized = await handleError(httpError, {
        source: 'grok',
        errorType: 'httpError',
        logError: true,
        createUserMessage: true,
        context: {
          operation: 'fetchRequestWithImage',
          model: modelName,
          statusCode: fetchError.status,
          errorData: errorData?.error
        }
      });
      
      const uiLang = await getUILanguageCached();
      let errorMessage = normalized.userMessage;
      if (!errorMessage) {
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
      error.code = normalized.code;
      error.status = fetchError.status;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    const normalized = await handleError(fetchError, {
      source: 'grok',
      errorType: 'networkError',
      logError: true,
      createUserMessage: true,
      context: {
        operation: 'fetchRequestWithImage',
        model: modelName,
        errorName: fetchError.name
      }
    });
    
    const uiLang = await getUILanguageCached();
    const userMessage = normalized.userMessage || tSync('errorNetwork', uiLang);
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(userMessage);
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch (parseError) {
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



