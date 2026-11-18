import { createApiError, isApiBoundaryError } from './http-errors.js';
// @ts-check
// Claude API module for ClipAIble extension

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { assertCompleteAIResponse } from './response-validation.js';
import { parseBase64Image } from './image-data.js';
import { callWithRetry } from '../utils/retry.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';
import { getDefaultModel, getModelMetadata } from '../utils/model-catalog.js';

/** Build Messages API parameters for the selected model and response role. */
export function getClaudeRequestConfig(model, { maxTokens = 50000, shortResponse = false } = {}) {
  const selectedModel = model || getDefaultModel('claude');
  const metadata = getModelMetadata('claude', selectedModel, { strict: true });
  const modelName = metadata?.apiModel || selectedModel;
  /** @type {{model: string, max_tokens: number, thinking?: {type: string}, output_config?: {effort: string}, system?: string}} */
  const config = { model: modelName, max_tokens: maxTokens };
  if (metadata?.reasoningEffort === 'none') {
    config.thinking = { type: 'disabled' };
  } else if (metadata?.reasoningEffort) {
    config.output_config = { effort: metadata.reasoningEffort };
    config.thinking = { type: 'adaptive' };
  }
  if (shortResponse) {
    if (!metadata?.reasoningEffort && modelName === 'claude-sonnet-5-5') config.thinking = { type: 'between_tools' };
    else if (!metadata?.reasoningEffort && modelName === 'claude-haiku-5-5') config.thinking = { type: 'disabled' };
    if ((metadata?.reasoningEffort && metadata.reasoningEffort !== 'none') || modelName === 'claude-opus-5-5' || modelName === 'claude-fable-5-2') config.max_tokens = 50000;
  }
  return config;
}

/** Select answer text without treating thinking or signatures as content. */
export function getClaudeResponseText(response) {
  return (response?.content || []).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('');
}

/**
 * Call Claude API
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt
 * @param {string} apiKey - Claude API key
 * @param {string} model - Model name
 * @param {boolean} jsonResponse - Whether to expect JSON response
 * @returns {Promise<Object|string>} Parsed JSON or text response
 */
export async function callClaudeAPI(systemPrompt, userPrompt, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callClaudeAPI', { model, systemPromptLength: systemPrompt.length, userPromptLength: userPrompt.length });
  
  const requestBody = {
    ...getClaudeRequestConfig(model),
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
    // Each retry has an independent request deadline.
    response = await callWithRetry(
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.anthropic.com/v1/messages', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
        
        // If not ok and retryable, throw error for retry logic
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'claude');

        return fetchResponse;

      },
      {
        onRetry: (attempt, delay) => {
          log(`Claude API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError instanceof TypeError) Object.assign(fetchError, { code: 'network_error', translationKey: 'errorNetwork', translationParams: {} });
    await requestOptions.checkCancelled?.();
    throw fetchError;
  }
  
  log('Claude response', { status: response.status, ok: response.ok });

  const result = await response.json();
  await requestOptions.checkCancelled?.();
  assertCompleteAIResponse(result, 'claude');
  log('Claude response received', { contentLength: getClaudeResponseText(result).length });
  
  // Claude returns content as array with text blocks
  const textContent = getClaudeResponseText(result);
  if (!textContent) throw new Error('No content in API response');
  
  if (jsonResponse && textContent) {
    try {
      return JSON.parse(textContent);
    } catch (e) {
    if (isApiBoundaryError(e)) throw e;
      // Try to extract JSON from markdown code block
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (extractError) {
    if (isApiBoundaryError(extractError)) throw extractError;
          // Normalize error with context for better logging and error tracking
          const normalized = await handleError(extractError, {
            source: 'claude',
            errorType: 'jsonParseError',
            logError: true,
            createUserMessage: false, // Keep existing localized message
            context: {
              operation: 'parseJsonResponse',
              model: requestBody.model,
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
          model: requestBody.model,
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
export async function callClaudeAPIWithImage(systemPrompt, userPrompt, imageData, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callClaudeAPIWithImage', { model, imageSize: imageData.length });
  
  // Claude expects base64 without data URL prefix
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  const requestBody = {
    ...getClaudeRequestConfig(model),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
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
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.anthropic.com/v1/messages', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
          
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'claude');

        return fetchResponse;

      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    await requestOptions.checkCancelled?.();
    assertCompleteAIResponse(data, 'claude');
    const content = getClaudeResponseText(data);
    if (!content) {
      logError('Claude API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    if (jsonResponse) {
      try {
        return JSON.parse(content);
      } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
        logError('Failed to parse Claude response as JSON', { content, parseError });
        throw new Error(`Invalid JSON response from Claude: ${parseError.message}`);
      }
    }
    
    return content;
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    await requestOptions.checkCancelled?.();
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
 * @returns {Promise<{result: Object|string, assistantMessage: Array<Object>, userMessage: Object}>}
 */
export async function callClaudeAPIWithImageAndHistory(systemPrompt, userPrompt, imageData, messageHistory, apiKey, model, jsonResponse = true, requestOptions = {}) {
  log('callClaudeAPIWithImageAndHistory', { model, imageSize: imageData.length, historyLength: messageHistory.length });
  
  const { base64Image, mimeType } = parseBase64Image(imageData);
  
  // Build current user message with image
  const currentUserMessage = {
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
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
    ...getClaudeRequestConfig(model),
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
      async ({ signal }) => {
        
        const fetchResponse = await fetchBufferedResponse('https://api.anthropic.com/v1/messages', { signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, requestOptions);
          
        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'claude');

        return fetchResponse;

      },
      {
        maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
        delays: CONFIG.RETRY_DELAYS,
        retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
      }
    );
    
    const data = await response.json();
    await requestOptions.checkCancelled?.();
    assertCompleteAIResponse(data, 'claude');
    const content = getClaudeResponseText(data);
    if (!content) {
      logError('Claude API response missing content', { data });
      throw new Error('No content in API response');
    }
    
    let result;
    if (jsonResponse) {
      try {
        result = JSON.parse(content);
      } catch (parseError) {
    if (isApiBoundaryError(parseError)) throw parseError;
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
    if (isApiBoundaryError(fixError)) throw fixError;
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
    if (isApiBoundaryError(e)) throw e;
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
      assistantMessage: data.content, // Preserve signed thinking blocks in history.
      userMessage: currentUserMessage // Store full user message with image for history
    };
  } catch (error) {
    if (isApiBoundaryError(error)) throw error;
    await requestOptions.checkCancelled?.();
    logError('Claude API call with image and history failed', error);
    throw error;
  }
}

