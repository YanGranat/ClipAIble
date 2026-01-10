// @ts-check
// Claude API module for ClipAIble extension

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';

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
    max_tokens: 50000,
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
    logDebug('Sending request to Claude API...');
    
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
          log(`Claude API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      // Normalize timeout error with context
      const normalized = await handleError(fetchError, {
        source: 'claude',
        errorType: 'timeoutError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'fetchRequest',
          model: model || 'claude-sonnet-4-5',
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
        source: 'claude',
        errorType: 'httpError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message with status handling
        context: {
          operation: 'fetchRequest',
          model: model || 'claude-sonnet-4-5',
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
      source: 'claude',
      errorType: 'networkError',
      logError: true,
      createUserMessage: false, // Keep existing localized message
      context: {
        operation: 'fetchRequest',
        model: model || 'claude-sonnet-4-5',
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
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (extractError) {
          // Normalize error with context for better logging and error tracking
          const normalized = await handleError(extractError, {
            source: 'claude',
            errorType: 'jsonParseError',
            logError: true,
            createUserMessage: false, // Keep existing localized message
            context: {
              operation: 'parseJsonResponse',
              model: model || 'claude-sonnet-4-5',
              contentLength: textContent.length,
              contentPreview: textContent.substring(0, 500),
              extractedFromMarkdown: true
            }
          });
          
          const uiLang = await getUILanguageCached();
          const userMessage = tSync('errorInvalidJsonResponse', uiLang);
          /** @type {import('../types.js').ExtendedError} */
          const error = new Error(userMessage);
          error.code = normalized.code;
          error.originalError = normalized.originalError;
          error.context = normalized.context;
          throw error;
        }
      }
      
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(e, {
        source: 'claude',
        errorType: 'invalidJsonError',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'parseJsonResponse',
          model: model || 'claude-sonnet-4-5',
          contentLength: textContent.length,
          contentPreview: textContent.substring(0, 500),
          extractedFromMarkdown: false
        }
      });
      
      const uiLang = await getUILanguageCached();
      const userMessage = normalized.userMessage || tSync('errorInvalidJsonResponse', uiLang);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
  }
  
  return textContent;
}

/**
 * Call Claude API with image support
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {string} apiKey - Claude API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callClaudeAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true) {
  log('callClaudeAPIWithImage', { model, imageSize: imageData.length });
  
  // Claude expects base64 without data URL prefix
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  const requestBody = {
    model: model || 'claude-sonnet-4-5',
    max_tokens: 50000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: userPrompt
          }
        ]
      }
    ]
  };
  
  // Claude uses system as a top-level parameter
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }
  
  let response;
  
  try {
    logDebug('Sending request to Claude API with image...');
    
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
            const uiLang = await getUILanguageCached();
            const errorMessage = errorData.error?.message || `API error: ${fetchResponse.status}`;
            clearTimeout(timeout);
            throw new Error(errorMessage);
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
    const content = data.content?.[0]?.text;
    if (!content) {
      logError('Claude API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    if (jsonResponse) {
      try {
        return JSON.parse(content);
      } catch (parseError) {
        logError('Failed to parse Claude response as JSON', { content, parseError });
        throw new Error(`Invalid JSON response from Claude: ${parseError.message}`);
      }
    }
    
    return content;
  } catch (error) {
    logError('Claude API call with image failed', error);
    throw error;
  }
}

/**
 * Call Claude API with image and conversation history
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} imageData - Base64 image data URL
 * @param {Array<Object>} messageHistory - Previous messages [{role: 'user'|'assistant', content: string}]
 * @param {string} apiKey - Claude API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<{result: Object|string, assistantMessage: string, userMessage: Object}>}
 */
export async function callClaudeAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true) {
  log('callClaudeAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const base64Image = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  
  // Build current user message with image
  const currentUserMessage = {
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Image
        }
      },
      {
        type: 'text',
        text: userPrompt
      }
    ]
  };
  
  // Build messages array with history
  const messages = [
    ...messageHistory, // Previous messages (with images from previous pages)
    currentUserMessage // Current page with image
  ];
  
  const requestBody = {
    model: model || 'claude-sonnet-4-5',
    max_tokens: 50000,
    messages: messages
  };
  
  // Claude uses system as a top-level parameter
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }
  
  let response;
  
  try {
    logDebug('Sending request to Claude API with image and history...');
    
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
            const uiLang = await getUILanguageCached();
            const errorMessage = errorData.error?.message || `API error: ${fetchResponse.status}`;
            clearTimeout(timeout);
            throw new Error(errorMessage);
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
    const content = data.content?.[0]?.text;
    if (!content) {
      logError('Claude API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    let result;
    if (jsonResponse) {
      try {
        result = JSON.parse(content);
      } catch (parseError) {
        // Try to fix common JSON issues: unescaped control characters
        logWarn('Failed to parse Claude response as JSON, attempting to fix', { 
          parseError: parseError.message,
          contentPreview: content.substring(0, 200)
        });
        
        try {
          // Try to extract JSON from markdown code block first
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[1].trim());
            log('Successfully parsed JSON from markdown code block');
          } else {
            // Try to fix unescaped control characters in JSON strings
            // Replace unescaped newlines, tabs, etc. in string values
            let fixedContent = content;
            
            // Fix unescaped newlines in string values (but not in the JSON structure itself)
            // This regex finds string values and fixes unescaped newlines
            fixedContent = fixedContent.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, str) => {
              // Only fix if it contains unescaped control characters
              if (/[\n\r\t]/.test(str)) {
                return '"' + str.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
              }
              return match;
            });
            
            result = JSON.parse(fixedContent);
            log('Successfully parsed JSON after fixing control characters');
          }
        } catch (fixError) {
          // Last resort: try to extract text field manually if JSON structure is visible
          logWarn('JSON fix failed, attempting manual extraction', { 
            fixError: fixError.message,
            contentLength: content.length
          });
          
          // Last resort: try to extract text field manually if JSON structure is visible
          // Look for "text": "..." pattern, handling unescaped characters
          // Try multiple patterns to handle different JSON malformations
          let extractedText = null;
          let mergeWithPrevious = 'paragraph';
          let metadata = {};
          
          // Pattern 1: Standard JSON string (may have escaped quotes)
          const textMatch1 = content.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (textMatch1) {
            extractedText = textMatch1[1];
            // Unescape JSON string
            extractedText = extractedText.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          } else {
            // Pattern 2: Text field with unescaped newlines (find from "text": to next " or end)
            const textStartMatch = content.match(/"text"\s*:\s*"/);
            if (textStartMatch) {
              const startPos = textStartMatch.index + textStartMatch[0].length;
              // Find the end of the text field - look for ", or end of content if JSON is incomplete
              let endPos = content.indexOf('",', startPos);
              if (endPos === -1) {
                // JSON might be incomplete, try to find end of text field by looking for next field
                const nextFieldMatch = content.substring(startPos).match(/",\s*"(?:mergeWithPrevious|metadata)"/);
                if (nextFieldMatch) {
                  endPos = startPos + nextFieldMatch.index;
                } else {
                  // Last resort: use rest of content (JSON is incomplete)
                  endPos = content.length;
                }
              }
              if (endPos > startPos) {
                extractedText = content.substring(startPos, endPos);
                // Replace unescaped newlines/tabs with escaped versions for proper handling
                extractedText = extractedText.replace(/\n/g, '\n').replace(/\r/g, '\r').replace(/\t/g, '\t');
              }
            }
          }
          
          // Extract mergeWithPrevious if present
          const mergeMatch = content.match(/"mergeWithPrevious"\s*:\s*"([^"]+)"/);
          if (mergeMatch && ['direct', 'newline', 'paragraph'].includes(mergeMatch[1])) {
            mergeWithPrevious = mergeMatch[1];
          }
          
          // Extract metadata if present (try to parse safely)
          const metadataMatch = content.match(/"metadata"\s*:\s*(\{[^}]*\})/);
          if (metadataMatch) {
            try {
              metadata = JSON.parse(metadataMatch[1]);
            } catch (e) {
              // Ignore metadata parse errors
            }
          }
          
          if (extractedText) {
            result = {
              text: extractedText,
              mergeWithPrevious: mergeWithPrevious,
              metadata: metadata
            };
            log('Successfully extracted text field manually from malformed JSON', {
              textLength: extractedText.length,
              hasMergeWithPrevious: !!mergeMatch,
              hasMetadata: !!metadataMatch
            });
          } else {
            logError('Failed to parse Claude response as JSON and could not extract text', { 
              content: content.substring(0, 1000),
              parseError: parseError.message 
            });
            throw new Error(`Invalid JSON response from Claude: ${parseError.message}`);
          }
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
    logError('Claude API call with image and history failed', error);
    throw error;
  }
}

